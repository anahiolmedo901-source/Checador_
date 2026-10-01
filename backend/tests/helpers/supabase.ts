import { vi } from 'vitest';
import { supabaseAdmin, supabaseAuth } from '../../src/config/supabase';
import { permissionService } from '../../src/services/permission.service';

type Row = Record<string, unknown>;

type Op =
  | { kind: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'is'; col: string; val: unknown }
  | { kind: 'ilike'; col: string; pat: string }
  | { kind: 'in'; col: string; vals: unknown[] };

type RpcFn = (args: Record<string, unknown>) => Promise<{ data?: unknown; error?: { message: string } | null }>;

const OR_SEGMENT = /^([a-z_]+)\.([a-z]+)\.(.+)$/;

function parseOr(expr: string): Op[] {
  return expr.split(',').map((segment) => {
    const m = OR_SEGMENT.exec(segment.trim());
    if (!m) throw new Error(`No se puede parsear filtro: "${segment}"`);
    const [, col, op, raw] = m;
    if (op === 'ilike') return { kind: 'ilike', col, pat: raw };
    if (op === 'in') return { kind: 'in', col, vals: raw.split(/(?<!\\)\./) };
    let val: unknown = raw;
    if (raw === 'null') val = null;
    return { kind: op as Op['kind'], col, val };
  });
}

function matchOp(row: Row, op: Op): boolean {
  const got = row[op.col];
  switch (op.kind) {
    case 'eq': return String(got) === String(op.val);
    case 'neq': return String(got) !== String(op.val);
    case 'gt': return (got as number) > (op.val as number);
    case 'gte': return (got as number) >= (op.val as number);
    case 'lt': return (got as number) < (op.val as number);
    case 'lte': return (got as number) <= (op.val as number);
    case 'is': return op.val === null ? got === null || got === undefined : String(got) === String(op.val);
    case 'in': return (op.vals as unknown[]).some((v) => String(got) === String(v));
    case 'ilike': {
      const pat = String(op.pat).toLowerCase();
      const re = new RegExp(
        `^${pat.split('%').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`
      );
      return re.test(String(got ?? '').toLowerCase());
    }
  }
}

interface MockEnv {
  store: Map<string, Row[]>;
  rpc: Map<string, RpcFn>;
  tokenUsers: Map<string, unknown>;
  calls: string[];
}

const env: MockEnv = { store: new Map(), rpc: new Map(), tokenUsers: new Map(), calls: [] };

let installed = false;
const spies: ReturnType<typeof vi.spyOn>[] = [];

const DEFAULT_RPCS: Record<string, () => Promise<{ data?: unknown; error?: { message: string } | null }>> = {
  admin_write_audit: async () => ({ data: null, error: null }),
  display_heartbeat: async () => ({ data: null, error: null }),
};

function ensureTable(table: string): Row[] {
  if (!env.store.has(table)) env.store.set(table, []);
  return env.store.get(table)!;
}

function compareRows(a: Row, b: Row, col: string, dir: number): number {
  const av = a[col];
  const bv = b[col];
  if (av === bv) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
  return String(av) < String(bv) ? -dir : dir;
}

function makeChain(table: string) {
  const eqOps: Op[] = [];
  const orGroups: Op[][] = [];
  let inOp: Op | null = null;
  let orderBy: { col: string; dir: number } | null = null;
  let range: [number, number] | null = null;
  let limitN: number | null = null;
  let wantCount = false;
  let wantSingle = false;
  let wantedCols: string | null = null;
  let pendingInsert: Row[] | null = null;
  let pendingUpdate: Row | null = null;

  function filtered(): Row[] {
    return ensureTable(table).filter((row) => {
      const eqOk = eqOps.every((op) => matchOp(row, op));
      const orOk = orGroups.length === 0 || orGroups.some((group) => group.every((op) => matchOp(row, op)));
      const inOk = inOp === null || (inOp.kind === 'in' && inOp.vals.some((v) => String(row[inOp!.col]) === String(v)));
      return eqOk && orOk && inOk;
    });
  }

  function pick(row: Row): unknown {
    if (!wantedCols || wantedCols === '*') return row;
    const keep = wantedCols.split(',').map((s) => s.split('(')[0].trim()).filter(Boolean);
    return keep.filter((k) => k in row).reduce((acc, k) => ({ ...acc, [k]: row[k] }), {});
  }

  function run(): Record<string, unknown> {
    env.calls.push(`from:${table}`);
    if (pendingUpdate) {
      const rows = filtered();
      for (const r of rows) Object.assign(r, pendingUpdate as Row);
      const sel = rows.length ? rows[0] : null;
      return { data: wantSingle && sel ? pick(sel) : null, error: null };
    }
    if (pendingInsert) {
      ensureTable(table);
      const added: Row[] = [];
      for (const row of pendingInsert) {
        const next: Row = {
          id: `id-${table}-${ensureTable(table).length + added.length + 1}`,
          created_at: new Date().toISOString(),
          ...row,
        };
        ensureTable(table).push(next);
        added.push(next);
      }
      const sel = added[0];
      return { data: wantSingle ? sel : added, error: null };
    }

    let rows = filtered();
    if (orderBy) rows = rows.slice().sort((a, b) => compareRows(a, b, orderBy!.col, orderBy!.dir));
    const count = rows.length;
    if (range) rows = rows.slice(range[0], range[1] + 1);
    if (limitN !== null) rows = rows.slice(0, limitN);

    const res: Record<string, unknown> = { data: wantSingle ? (rows[0] ?? null) : rows, error: null };
    if (wantCount) res.count = count;
    return res;
  }

  const chain: Record<string, unknown> = {
    select(columnsOrOpts?: unknown, opts?: unknown): unknown {
      if (opts && typeof opts === 'object' && (opts as { count?: string }).count) wantCount = true;
      else if (columnsOrOpts && typeof columnsOrOpts === 'object') wantCount = true;
      else wantedCols = (columnsOrOpts as string) ?? '*';
      return chain;
    },
    eq(col: string, val: unknown) { eqOps.push({ kind: 'eq', col, val }); return chain; },
    neq(col: string, val: unknown) { eqOps.push({ kind: 'neq', col, val }); return chain; },
    gte(col: string, val: unknown) { eqOps.push({ kind: 'gte', col, val }); return chain; },
    lte(col: string, val: unknown) { eqOps.push({ kind: 'lte', col, val }); return chain; },
    in(col: string, vals: unknown[]) { inOp = { kind: 'in', col, vals }; return chain; },
    ilike(col: string, pat: string) { eqOps.push({ kind: 'ilike', col, pat }); return chain; },
    contains() { return chain; },
    or(expr: string) {
      for (const op of parseOr(expr)) orGroups.push([op]);
      return chain;
    },
    order(col: string, opts?: { ascending?: boolean }) {
      orderBy = { col, dir: opts?.ascending === false ? -1 : 1 };
      return chain;
    },
    range(from: number, to: number) { range = [from, to]; return chain; },
    limit(n: number) { limitN = n; return chain; },
    insert(rows: Row | Row[]) {
      pendingInsert = Array.isArray(rows) ? rows : [rows];
      return chain;
    },
    update(patch: Row) { pendingUpdate = patch; return chain; },
    maybeSingle() { wantSingle = true; return chain; },
    single() { wantSingle = true; return chain; },
    then(onFulfilled: unknown, onRejected: unknown) {
      return Promise.resolve(run()).then(onFulfilled as never, onRejected as never);
    },
  };
  return chain;
}

/**
 * Instala mocks de spy sobre los singletons reales de Supabase (sin vi.mock):
 * `supabaseAdmin.from/rpc/storage.from` y los métodos de auth.
 */
export function installSupabaseMocks(): MockEnv & {
  reset: () => void;
  restore: () => void;
  seed: (table: string, rows: Row[]) => void;
  setRpc: (name: string, fn: RpcFn) => void;
  setLoginUser: (user: unknown, token: string) => void;
  setTokenUser: (token: string, user: unknown) => void;
  setSignInError: (message: string) => void;
  employee: (over: Partial<Row> & { id: string }) => Row;
  newId: () => string;
} {
  if (installed) {
    throw new Error('installSupabaseMocks() llamado dos veces en el mismo proceso de test.');
  }
  installed = true;

  const auth = supabaseAuth.auth as never as {
    signInWithPassword: (p: unknown) => Promise<unknown>;
    getUser: (t: string) => Promise<unknown>;
  };
  const adminAuth = supabaseAdmin.auth.admin as never as {
    createUser: (p: unknown) => Promise<unknown>;
    updateUserById: (id: string, p: unknown) => Promise<unknown>;
    deleteUser: (id: string) => Promise<unknown>;
  };
  const storage = supabaseAdmin.storage as never as {
    from: (bucket: string) => { createSignedUrl: (p: string, e: number) => Promise<unknown>; upload: (p: string) => Promise<unknown> };
  };

  spies.push(
    vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: unknown) => makeChain(String(table)) as never),
    vi.spyOn(supabaseAdmin, 'rpc').mockImplementation(async (fn: unknown, args: unknown) => {
      const handler = env.rpc.get(String(fn));
      env.calls.push(`rpc:${String(fn)}`);
      if (!handler) return { data: null, error: { message: `RPC ${String(fn)} no registrado en mocks` } } as never;
      return (await handler((args as Record<string, unknown>) ?? {})) as never;
    }),
    vi.spyOn(storage, 'from').mockImplementation((bucket: string) => ({
      createSignedUrl: vi.fn(async (path: string, expires: number) => ({
        data: { signedUrl: `https://signed/${bucket}/${path}?exp=${expires}` },
        error: null,
      })),
      upload: vi.fn(async () => ({ data: {}, error: null })),
      remove: vi.fn(async () => ({ error: null })),
    })),
    vi.spyOn(auth, 'signInWithPassword').mockImplementation(async () => ({
      data: { session: null, user: null },
      error: { message: 'Credenciales inválidas' },
    })),
    vi.spyOn(auth, 'getUser').mockImplementation(async (token: string) => ({
      data: { user: env.tokenUsers.get(token) ?? null },
      error: null,
    })),
    vi.spyOn(adminAuth, 'createUser').mockImplementation(async (p: unknown) => ({
      data: { user: { id: `auth-${(p as { email?: string }).email ?? 'x'}`, email: (p as { email?: string }).email ?? null } },
      error: null,
    })),
    vi.spyOn(adminAuth, 'updateUserById').mockImplementation(async () => ({ data: { user: {} }, error: null })),
    vi.spyOn(adminAuth, 'deleteUser').mockImplementation(async () => ({ data: { user: {} }, error: null }))
  );

  let idCounter = 0;

  return {
    store: env.store,
    rpc: env.rpc,
    tokenUsers: env.tokenUsers,
    calls: env.calls,
    newId: () => `00000000-0000-4000-8000-${String(++idCounter).padStart(12, '0')}`,
    seed(table, rows) {
      ensureTable(table).push(...rows);
    },
    setRpc(name, fn) {
      env.rpc.set(name, fn);
    },
    setLoginUser(user, token) {
      env.tokenUsers.set(token, user);
      auth.signInWithPassword.mockImplementation(async () => ({
        data: { session: { access_token: token }, user },
        error: null,
      }));
    },
    setTokenUser(token, user) {
      env.tokenUsers.set(token, user);
    },
    setSignInError(message) {
      auth.signInWithPassword.mockImplementation(async () => ({
        data: { session: null, user: null },
        error: { message },
      }));
    },
    employee(over) {
      const base: Row = {
        id: over.id,
        code: `E${String(idCounter++).padStart(3, '0')}`,
        full_name: 'Empleado de Prueba',
        first_name: 'Empleado',
        last_name: 'Prueba',
        phone: null,
        hire_date: new Date().toISOString(),
        photo_url: null,
        branch_id: null,
        department_id: null,
        position_id: null,
        role: 'employee',
        active: true,
        created_at: new Date().toISOString(),
        branches: null,
        departments: null,
        positions: null,
      };
      return { ...base, ...over };
    },
    reset() {
      env.store.clear();
      env.rpc.clear();
      env.tokenUsers.clear();
      env.calls.length = 0;
      env.store.set('role_permissions', [
        { role: 'admin', action: '*' },
        { role: 'hr', action: '*' },
        { role: 'employee', action: 'files.attendance.self' },
      ]);
      for (const [name, fn] of Object.entries(DEFAULT_RPCS)) env.rpc.set(name, fn);
      permissionService.invalidate();
      auth.signInWithPassword.mockImplementation(async () => ({
        data: { session: null, user: null },
        error: { message: 'Credenciales inválidas' },
      }));
      auth.getUser.mockImplementation(async (token: string) => ({
        data: { user: env.tokenUsers.get(token) ?? null },
        error: null,
      }));
    },
    restore() {
      for (const spy of spies) spy.mockRestore();
      installed = false;
    },
  };
}

export function bearer(token: string): string {
  return `Bearer ${token}`;
}