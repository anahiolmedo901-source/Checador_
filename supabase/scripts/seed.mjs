// Seed del proyecto Checador (modelo por sesiones).
// Crea bucket, sucursal, departamento, puesto, horario y usuarios demo:
//   admin (ADMIN01), RH (RH001), empleado (EMP001) y pantalla TV (TV001).
//
// Uso (desde la raíz del repo):
//   node --env-file-if-exists=.env supabase/scripts/seed.mjs
//
// Variables requeridas:
//   EXPO_PUBLIC_SUPABASE_URL       https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY      service_role (reservada, solo backend/seed)
//   SEED_ADMIN_PIN, SEED_EMP_PIN   (opcional) NIPs de usuarios demo
import { createClient } from '@supabase/supabase-js';

const assertEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    console.error(`Falta la variable de entorno: ${name}`);
    process.exit(1);
  }
  return value;
};

const url = assertEnv('EXPO_PUBLIC_SUPABASE_URL');
const serviceKey = assertEnv('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const EMAIL_DOMAIN = 'check.local';

async function createAuthUser(code, password, name, meta = {}) {
  const email = `${code.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
  const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list?.users?.find((u) => u.email === email);
  if (existing) return existing;

  // Reconciliación: si la entidad (empleado/pantalla) ya existe pero su
  // usuario Auth quedó con otro email, lo renombramos en vez de duplicar.
  const relTable = meta.role === 'display' ? 'displays' : 'employees';
  const { data: rel } = await supabase.from(relTable).select('*').eq('code', code).maybeSingle();
  if (rel) {
    const authUserId = meta.role === 'display' ? rel.auth_user_id : rel.id;
    if (authUserId) {
      const { data: renamed, error: renameErr } = await supabase.auth.admin.updateUserById(authUserId, {
        email,
        email_confirm: true,
      });
      if (renameErr) throw renameErr;
      return renamed.user;
    }
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name, ...meta },
  });
  if (error) throw error;
  return data.user;
}

async function getOrInsert(table, match, payload) {
  const { data: existing } = await supabase.from(table).select('*').eq(Object.keys(match)[0], Object.values(match)[0]).maybeSingle();
  if (existing) return existing;
  const { data, error } = await supabase.from(table).insert(payload).select().single();
  if (error) throw error;
  return data;
}

async function getOrInsertByCode(table, code, payload) {
  const { data: existing } = await supabase.from(table).select('*').eq('code', code).maybeSingle();
  if (existing) return existing;
  const { data, error } = await supabase.from(table).insert(payload).select().single();
  if (error) throw error;
  return data;
}

async function createEmployee(userId, { code, fullName, branchId, departmentId, role }) {
  return getOrInsertByCode(
    'employees',
    code,
    {
      id: userId,
      code,
      full_name: fullName,
      branch_id: branchId,
      department_id: departmentId,
      role,
    }
  );
}

async function ensureBucket() {
  const { data, error } = await supabase.storage.createBucket('attendance-evidence', {
    public: true,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  });
  if (error && error.message.includes('already exists')) {
    console.log('• Bucket attendance-evidence ya existe.');
    return;
  }
  if (error) throw error;
  console.log('• Bucket attendance-evidence creado.');
}

async function seed() {
  await ensureBucket();

  // Catálogos (idempotente: reutiliza si ya existen)
  const branch = await getOrInsert(
    'branches',
    { name: 'Sucursal Central' },
    {
      name: 'Sucursal Central',
      address: 'Av. Principal 123, Ciudad',
      lat: 20.667,
      lon: -103.349,
      radius_m: 300,
    }
  );

  const department = await getOrInsertByCode('departments', 'OPS', { name: 'Operaciones', code: 'OPS' });

  const position = await getOrInsertByCode(
    'positions',
    'OPS-AUX',
    { department_id: department.id, title: 'Auxiliar General', code: 'OPS-AUX' }
  );

  const schedule = await getOrInsertByCode(
    'schedules',
    'MAT-08',
    {
      name: 'Horario Matutino',
      code: 'MAT-08',
      check_in: '08:00',
      check_out: '17:00',
      tolerance_min: 5,
      break_min: 30,
    }
  );

  // Admin
  const admin = await createAuthUser('ADMIN01', process.env.SEED_ADMIN_PIN ?? 'admin123456', 'Administrador');
  await createEmployee(admin.id, {
    code: 'ADMIN01',
    fullName: 'Administrador del Sistema',
    branchId: branch.id,
    departmentId: department.id,
    role: 'admin',
  });

  // RH
  const hr = await createAuthUser('RH001', process.env.SEED_RH_PIN ?? 'rh123456', 'Recursos Humanos');
  await createEmployee(hr.id, {
    code: 'RH001',
    fullName: 'Recursos Humanos',
    branchId: branch.id,
    departmentId: department.id,
    role: 'hr',
  });

  // Empleado demo
  const demo = await createAuthUser('EMP001', process.env.SEED_EMP_PIN ?? 'emp123456', 'Empleado Demo');
  const employee = await createEmployee(demo.id, {
    code: 'EMP001',
    fullName: 'Empleado Demo',
    branchId: branch.id,
    departmentId: department.id,
    role: 'employee',
  });

  // Asignación de horario vigente (idempotente)
  const { data: existingAssign } = await supabase
    .from('employee_schedules')
    .select('*')
    .eq('employee_id', employee.id)
    .eq('schedule_id', schedule.id)
    .maybeSingle();
  if (!existingAssign) {
    const { error: assignErr } = await supabase
      .from('employee_schedules')
      .insert({ employee_id: employee.id, schedule_id: schedule.id });
    if (assignErr) throw assignErr;
  }

  // Pantalla demo (fase Smart Display)
  const tvUser = await createAuthUser('TV001', process.env.SEED_TV_PIN ?? 'tv123456', 'Smart Display', {
    role: 'display',
  });
  await getOrInsertByCode(
    'displays',
    'TV001',
    { name: 'Display Lobby', code: 'TV001', branch_id: branch.id, auth_user_id: tvUser.id }
  );

  console.log('Seed completado ✓');
  console.log('Sucursal:', branch.name);
  console.log('Departamento:', department.name, '| Puesto:', position.title);
  console.log('Horario:', schedule.name, `(${schedule.check_in}–${schedule.check_out})`);
  console.log('Admin    → usuario: ADMIN01  NIP:', process.env.SEED_ADMIN_PIN ?? 'admin123456');
  console.log('RH       → usuario: RH001    NIP:', process.env.SEED_RH_PIN ?? 'rh123456');
  console.log('Empleado → usuario: EMP001   NIP:', process.env.SEED_EMP_PIN ?? 'emp123456');
  console.log('Display  → usuario: TV001    NIP:', process.env.SEED_TV_PIN ?? 'tv123456');
}

seed().catch((err) => {
  console.error('Error en seed:', err.message);
  process.exit(1);
});