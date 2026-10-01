const TOKEN_KEY = 'checador_admin_token';
const USER_KEY = 'checador_admin_user';

interface AuthEmployee {
  id: string;
  code: string;
  full_name: string;
  role: 'admin' | 'hr' | 'employee';
}

export interface AuthUser {
  id: string;
  email: string;
  role: 'admin' | 'hr' | 'employee';
  employee: AuthEmployee;
}

class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

type QueryValue = string | number | undefined | null | boolean;

export function qs(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const s = search.toString();
  return s;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) };
  if (init?.body && !(init.body as BodyInit).constructor?.name?.includes('FormData')) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor.');
  }

  if (res.status === 401 && path !== '/auth/login') {
    clearSession();
    if (!window.location.pathname.startsWith('/login')) window.location.assign('/login');
  }

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  const p = payload as { success?: boolean; data?: T; error?: { code?: string; message?: string; details?: unknown } } | null;
  if (!res.ok || !p?.success) {
    throw new ApiError(
      res.status,
      p?.error?.code ?? 'HTTP_ERROR',
      p?.error?.message ?? `Error ${res.status}`,
      p?.error?.details
    );
  }
  return p.data as T;
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>(path),
  post: <T>(path: string, body?: unknown): Promise<T> => request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown): Promise<T> => request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string, body?: unknown): Promise<T> => request<T>(path, { method: 'DELETE', body: JSON.stringify(body ?? {}) }),
  upload: <T>(path: string, formData: FormData): Promise<T> => request<T>(path, { method: 'POST', body: formData }),
};

export interface EventStream {
  close: () => void;
}

export function connectEvents(
  path: string,
  onEvent: (event: string, data: unknown) => void,
  onState?: (state: 'open' | 'closed' | 'error') => void
): EventStream {
  const controller = new AbortController();
  let closed = false;
  const decoder = new TextDecoder();
  let buffer = '';

  async function run(): Promise<void> {
    try {
      const res = await fetch(`/api${path}`, {
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : undefined,
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      onState?.('open');
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary: number;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          let event = 'message';
          const dataLines: string[] = [];
          for (const rawLine of block.split('\n')) {
            const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
            else if (line.startsWith(':')) continue;
          }
          if (dataLines.length === 0) continue;
          let data: unknown = null;
          try {
            data = JSON.parse(dataLines.join('\n'));
          } catch {
            data = dataLines.join('\n');
          }
          onEvent(event, data);
        }
      }
      if (!closed) onState?.('closed');
    } catch {
      if (!closed) onState?.('error');
    }
  }

  void run();
  return {
    close() {
      closed = true;
      controller.abort();
    },
  };
}