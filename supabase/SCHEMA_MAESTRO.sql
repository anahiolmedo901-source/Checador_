-- ============================================================================
-- Checador — ESQUEMA MAESTRO (reemplaza 0001..0011)
-- ----------------------------------------------------------------------------
-- Esquema definitivo consolidado del sistema de control de asistencia.
-- Conserva EL MISMO modelo y RPC de las migraciones 0001–0011, reorganizado
-- por dependencias, documentado e idempotente (safe re-run).
--
--   1. Extensiones       6. Vistas         11. Storage + políticas de objetos
--   2. Enums             7. Funciones      12. Realtime (publicación push)
--   3. Tablas            8. RLS + políticas 13. Grants / revokes
--   4. Índices           9. Auditoría      14. Hardening (índices + checks)
--   5. Configuración     10. Displays
--
-- USO: pegar en el SQL Editor de Supabase (proyecto con esquema vacío).
-- Es re-ejecutable: tablas/imágenes/índices/constraints se crean de forma
-- segura; policies y triggers se recrean con drop previo.
-- ============================================================================

-- ============================================================================
-- 1. EXTENSIONES
-- ============================================================================
create extension if not exists "pgcrypto";

-- ============================================================================
-- 2. ENUMS
-- ============================================================================
do $$ begin
  create type public.employee_role as enum ('admin', 'hr', 'employee');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.attendance_type as enum ('check_in', 'check_out', 'break_out', 'break_in');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.attendance_status as enum ('on_time', 'late', 'out_of_window', 'excused');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.incident_type as enum ('late', 'absent', 'out_of_window', 'location', 'device', 'duplicate', 'other');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.incident_status as enum ('open', 'resolved');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.approval_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.off_type as enum ('permission', 'vacation', 'incapacity');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.media_kind as enum ('image', 'video', 'url');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.device_authorization as enum ('authorized', 'pending', 'denied');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 3. TABLAS
-- ============================================================================

-- ---------- Sucursales con geocerca ----------
create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  lat double precision not null,
  lon double precision not null,
  radius_m numeric not null default 300,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Departamentos ----------
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Puestos ----------
create table if not exists public.positions (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments(id),
  title text not null,
  code text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Horarios (modelo definitivo; reemplazó a `shifts`) ----------
create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  check_in time not null,
  check_out time not null,
  tolerance_min int not null default 5,
  break_min int not null default 30,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Empleados (id = auth.users.id) ----------
create table if not exists public.employees (
  id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique,
  full_name text not null,
  first_name text,
  last_name text,
  phone text,
  hire_date date,
  photo_url text,
  branch_id uuid references public.branches(id),
  department_id uuid references public.departments(id),
  position_id uuid references public.positions(id),
  role public.employee_role not null default 'employee',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Asignación de horario por empleado (con vigencia) ----------
create table if not exists public.employee_schedules (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  schedule_id uuid not null references public.schedules(id),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Dispositivos móviles registrados ----------
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete set null,
  device_identifier text not null,
  platform text not null check (platform in ('android', 'ios', 'web')),
  model text,
  manufacturer text,
  "authorization" public.device_authorization not null default 'pending',
  os_version text,
  app_version text,
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  constraint devices_identifier_unique unique (device_identifier)
);

-- ---------- Catálogo RBAC (permisos explícitos por rol) ----------
create table if not exists public.role_permissions (
  role public.employee_role not null,
  action text not null,
  primary key (role, action)
);

-- ---------- Pantallas (Smart Display / TV) ----------
create table if not exists public.displays (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  branch_id uuid references public.branches(id),
  auth_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'offline' check (status in ('online', 'offline')),
  software text,
  os_version text,
  settings jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- Tokens de display (hash; revocables) ----------
create table if not exists public.display_tokens (
  id uuid primary key default gen_random_uuid(),
  display_id uuid not null references public.displays(id) on delete cascade,
  token_hash text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_by uuid references public.employees(id) on delete set null
);

-- ---------- Avisos ----------
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience_role public.employee_role[] not null default array['employee'::public.employee_role],
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'critical')),
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  active boolean not null default true,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Multimedia ----------
create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  kind public.media_kind not null,
  title text not null,
  file_path text,
  url text,
  mime_type text,
  size_bytes bigint,
  duration_s int,
  active boolean not null default true,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint media_file_or_url check (kind = 'url' or file_path is not null)
);

-- ---------- Playlists de pantalla ----------
create table if not exists public.display_playlists (
  id uuid primary key default gen_random_uuid(),
  display_id uuid not null references public.displays(id) on delete cascade,
  position int not null default 0,
  item_type text not null check (item_type in ('announcement', 'media', 'stats')),
  item_id uuid,
  duration_s int not null default 15,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint display_playlist_item_required check (
    (item_type = 'stats' and item_id is null) or (item_type <> 'stats' and item_id is not null)
  )
);

-- ---------- Notificaciones ----------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'general',
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- Asistencias: eventos dentro de una sesión ----------
-- Una sesión agrupa las checadas del mismo día laboral:
--   check_in -> break_out -> break_in -> check_out
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  employee_id uuid not null references public.employees(id) on delete cascade,
  branch_id uuid references public.branches(id),
  device_id uuid references public.devices(id),
  check_type public.attendance_type not null default 'check_in',
  check_date date not null,
  happened_at timestamptz not null default now(),
  status public.attendance_status not null default 'on_time',
  lat double precision,
  lon double precision,
  accuracy_m double precision,
  photo_url text,
  source text not null default 'mobile'
    check (source in ('mobile', 'device', 'display', 'import', 'manual')),
  idempotency_key uuid,
  note text,
  created_at timestamptz not null default now()
);

-- ---------- Evidencia por evento (Storage; aquí solo referencia) ----------
create table if not exists public.attendance_evidence (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid not null references public.attendance(id) on delete cascade,
  kind text not null default 'photo' check (kind in ('photo', 'video', 'signature')),
  file_path text not null,
  sha256 text,
  mime_type text,
  size_bytes bigint,
  uploaded_at timestamptz not null default now()
);

-- ---------- Permisos / vacaciones / incapacidades ----------
create table if not exists public.offtime_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  off_type public.off_type not null,
  starts_on date not null,
  ends_on date not null,
  reason text not null,
  status public.approval_status not null default 'pending',
  reviewed_by uuid references public.employees(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  ticket uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  constraint offtime_dates_order check (ends_on >= starts_on)
);

-- ---------- Incidencias ----------
create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  attendance_id uuid references public.attendance(id) on delete set null,
  incident_type public.incident_type not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  detail jsonb not null default '{}'::jsonb,
  status public.incident_status not null default 'open',
  resolved_by uuid references public.employees(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- Auditoría ----------
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text,
  action text not null,
  entity text not null,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  ip inet,
  created_at timestamptz not null default now()
);

-- ---------- Configuración de la aplicación ----------
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 4. ÍNDICES
-- ============================================================================
create index if not exists employees_branch_id_idx on public.employees (branch_id);
create index if not exists employees_department_idx on public.employees (department_id);
create index if not exists employees_position_idx on public.employees (position_id);
create index if not exists employees_full_name_idx on public.employees (full_name);

create index if not exists employee_schedules_employee_idx on public.employee_schedules (employee_id, effective_from);

create index if not exists devices_employee_idx on public.devices (employee_id);

create index if not exists display_tokens_display_idx on public.display_tokens (display_id);
create index if not exists display_playlists_display_idx on public.display_playlists (display_id, position);

create index if not exists announcements_active_idx on public.announcements (active, published_at);
create index if not exists media_kind_idx on public.media (kind);

create index if not exists notifications_user_idx on public.notifications (user_id, read_at);

create index if not exists attendance_session_idx on public.attendance (session_id);
create index if not exists attendance_employee_date_idx on public.attendance (employee_id, check_date desc, happened_at desc);
create index if not exists attendance_branch_idx on public.attendance (branch_id);

-- Idempotencia: un solo check_in por empleado y día laboral.
create unique index if not exists attendance_one_check_in_per_day_idx
  on public.attendance (employee_id, check_date, check_type)
  where check_type = 'check_in';

-- Idempotencia de reintentos por red/offline en cualquier evento.
create unique index if not exists attendance_idempotency_key_idx
  on public.attendance (idempotency_key)
  where idempotency_key is not null;

create index if not exists attendance_evidence_attendance_idx on public.attendance_evidence (attendance_id);

create index if not exists offtime_employee_idx on public.offtime_requests (employee_id, starts_on);
create index if not exists offtime_status_idx on public.offtime_requests (status);

create index if not exists incidents_employee_idx on public.incidents (employee_id, created_at);
create index if not exists incidents_status_idx on public.incidents (status);

create index if not exists audit_logs_entity_idx on public.audit_logs (entity, created_at);
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id, created_at);

-- ============================================================================
-- 5. CONFIGURACIÓN (zona horaria del día laboral)
-- ============================================================================
insert into public.app_settings (key, value)
values ('default_timezone', '"America/Hermosillo"')
on conflict (key) do update set value = excluded.value, updated_at = now();

create or replace function public.session_timezone()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select value #>> '{}' from public.app_settings where key = 'default_timezone'),
    'America/Hermosillo'
  );
$$;

create or replace function public.session_check_date()
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (now() at time zone public.session_timezone())::date;
$$;

-- ============================================================================
-- 6. VISTAS
-- ============================================================================

-- ---------- Sesiones (compatible con la app móvil) ----------
-- Una fila por sesión con el mismo shape del modelo viejo.
create or replace view public.attendance_sessions as
with grouped as (
  select
    a.session_id,
    (array_agg(a.employee_id))[1]                     as employee_id,
    (array_agg(a.branch_id))[1]                       as branch_id,
    (array_agg(a.device_id))[1]                       as device_id,
    max(a.check_date)                                as check_date,
    max(a.happened_at) filter (where a.check_type = 'check_in')   as check_in,
    max(a.happened_at) filter (where a.check_type = 'check_out')  as check_out,
    max(a.happened_at) filter (where a.check_type = 'break_out')  as break_out_at,
    max(a.happened_at) filter (where a.check_type = 'break_in')   as break_in_at,
    max(a.status) filter (where a.check_type = 'check_in')        as status,
    max(a.photo_url) filter (where a.check_type = 'check_in')     as photo_url,
    max(a.photo_url) filter (where a.check_type = 'check_out')    as photo_out_url,
    max(a.lat) filter (where a.check_type = 'check_in')           as lat,
    max(a.lon) filter (where a.check_type = 'check_in')           as lon,
    max(a.accuracy_m) filter (where a.check_type = 'check_in')    as accuracy_m,
    max(a.lat) filter (where a.check_type = 'check_out')          as lat_out,
    max(a.lon) filter (where a.check_type = 'check_out')          as lon_out,
    max(a.accuracy_m) filter (where a.check_type = 'check_out')   as accuracy_out_m,
    max(a.source)                                    as source,
    max(a.created_at)                                as created_at
  from public.attendance a
  group by a.session_id
)
select
  g.session_id                                                  as id,
  g.employee_id,
  g.branch_id,
  g.device_id,
  g.check_date,
  g.check_in,
  g.check_out,
  g.break_out_at,
  g.break_in_at,
  g.status,
  g.photo_url,
  g.photo_out_url,
  g.lat,
  g.lon,
  g.accuracy_m,
  g.lat_out,
  g.lon_out,
  g.accuracy_out_m,
  g.source,
  g.created_at,
  (g.check_in is not null and g.check_out is null)              as is_open,
  case
    when g.check_out is not null and g.check_in is not null
    then round(extract(epoch from (g.check_out - g.check_in)) / 60.0, 2)
    else null
  end                                                           as minutes_worked
from grouped g;

-- ---------- Días laborales (reporte: falta/permiso/…) ----------
create or replace view public.attendance_days as
select
  s.employee_id,
  s.check_date,
  s.check_in,
  s.check_out,
  s.minutes_worked,
  s.status                                                         as session_status,
  case
    when exists (
      select 1 from public.offtime_requests o
      where o.employee_id = s.employee_id
        and o.status = 'approved'
        and s.check_date between o.starts_on and o.ends_on
    ) then 'excused'::public.attendance_status
    else s.status
  end                                                             as status,
  (
    select array_agg(o.off_type)
    from public.offtime_requests o
    where o.employee_id = s.employee_id
      and o.status = 'approved'
      and s.check_date between o.starts_on and o.ends_on
  )                                                               as excused_types,
  s.branch_id
from public.attendance_sessions s;

-- ---------- Historial con sucursal (app) ----------
create or replace view public.attendance_list as
select
  s.id, s.employee_id, s.branch_id, s.device_id, s.check_date,
  s.check_in, s.check_out, s.break_out_at, s.break_in_at,
  s.status, s.photo_url, s.photo_out_url, s.lat, s.lon, s.accuracy_m,
  s.lat_out, s.lon_out, s.accuracy_out_m, s.source, s.created_at,
  s.is_open, s.minutes_worked,
  b.name as branch_name,
  b.address as branch_address
from public.attendance_sessions s
left join public.branches b on b.id = s.branch_id;

-- ============================================================================
-- 7. FUNCIONES (RPC)
-- Todas security definer: los clientes NO tocan tablas directamente.
-- ============================================================================

-- ---------- Horario vigente de un empleado ----------
create or replace function public.current_schedule_for(p_employee_id uuid)
returns public.schedules
language sql
stable
security definer
set search_path = public
as $$
  select s.*
  from public.schedules s
  join public.employee_schedules es on es.schedule_id = s.id
  where es.employee_id = p_employee_id
    and es.active
    and s.active
    and es.effective_from <= now()
    and (es.effective_to is null or es.effective_to >= now())
  order by es.effective_from desc
  limit 1;
$$;

-- ---------- Perfil del empleado autenticado ----------
create or replace function public.employee_profile()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'employee', jsonb_build_object(
      'id', e.id,
      'code', e.code,
      'full_name', e.full_name,
      'photo_url', e.photo_url,
      'role', e.role,
      'active', e.active
    ),
    'branch', (case when b.id is null then null else jsonb_build_object(
      'id', b.id,
      'name', b.name,
      'address', b.address,
      'lat', b.lat,
      'lon', b.lon,
      'radius_m', b.radius_m
    ) end),
    'shift', (case when s.id is null then null else jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'code', s.code,
      'start_time', to_char(s.check_in, 'HH24:MI'),
      'end_time', to_char(s.check_out, 'HH24:MI'),
      'tolerance_min', s.tolerance_min,
      'break_min', s.break_min
    ) end),
    'department', (case when d.id is null then null else jsonb_build_object(
      'id', d.id,
      'name', d.name,
      'code', d.code
    ) end),
    'position', (case when p.id is null then null else jsonb_build_object(
      'id', p.id,
      'title', p.title,
      'code', p.code
    ) end)
  )
  from public.employees e
  left join public.branches b on b.id = e.branch_id
  left join public.current_schedule_for(e.id) s on true
  left join public.departments d on d.id = e.department_id
  left join public.positions p on p.id = e.position_id
  where e.id = auth.uid();
$$;

-- ---------- Sesión abierta del empleado ----------
create or replace function public.my_open_attendance()
returns setof public.attendance_sessions
language sql
security definer
set search_path = public
as $$
  select s.*
  from public.attendance_sessions s
  where s.employee_id = auth.uid()
    and s.is_open
  order by s.check_in desc
  limit 1;
$$;

-- ---------- Dispositivos ----------
create or replace function public.register_device(
  p_device_identifier text,
  p_platform text,
  p_model text default null,
  p_manufacturer text default null,
  p_os_version text default null,
  p_app_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee public.employees;
  v_device public.devices;
  v_auth public.device_authorization;
begin
  select * into v_employee from public.employees where id = auth.uid();
  if not found then
    raise exception 'No tienes un perfil de empleado válido.';
  end if;
  if not v_employee.active then
    raise exception 'Tu cuenta está inactiva. Contacta al administrador.';
  end if;

  select * into v_device from public.devices where device_identifier = p_device_identifier;
  if found then
    -- Dispositivo volvió a iniciar sesión: re-vincular y refrescar datos.
    v_auth := 'authorized';
    update public.devices
      set employee_id = v_employee.id,
          platform = p_platform,
          model = coalesce(p_model, model),
          manufacturer = coalesce(p_manufacturer, manufacturer),
          os_version = coalesce(p_os_version, os_version),
          app_version = coalesce(p_app_version, app_version),
          "authorization" = v_auth,
          last_seen_at = now()
      where id = v_device.id
      returning * into v_device;
    return jsonb_build_object(
      'id', v_device.id,
      'authorization', v_device.authorization,
      'is_active', v_device.is_active,
      'employee_id', v_device.employee_id
    );
  end if;

  -- Todos los dispositivos nuevos se habilitan automáticamente.
  v_auth := 'authorized';

  insert into public.devices(
    employee_id, device_identifier, platform, model, manufacturer,
    os_version, app_version, "authorization", last_seen_at, is_active
  )
  values (
    v_employee.id, p_device_identifier, p_platform, p_model, p_manufacturer,
    p_os_version, p_app_version, v_auth, now(), true
  )
  returning * into v_device;

  return jsonb_build_object(
    'id', v_device.id,
    'authorization', v_device.authorization,
    'is_active', v_device.is_active,
    'employee_id', v_device.employee_id
  );
end;
$$;

-- Valida la pertenencia y que no esté desactivado (solo se invoca desde
-- funciones security definer; sin grants para clientes).
create or replace function public.assert_device_usable(p_device_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.devices;
begin
  if p_device_id is null then
    return;
  end if;
  select * into v_device from public.devices where id = p_device_id;
  if not found or v_device.employee_id is distinct from auth.uid() then
    raise exception 'El dispositivo no está registrado para esta cuenta.';
  end if;
  if not v_device.is_active then
    raise exception 'El dispositivo está desactivado. Contacta al administrador.';
  end if;
  update public.devices set last_seen_at = now() where id = p_device_id;
end;
$$;

-- ---------- Geocerca server-side (fuente de verdad) ----------
create or replace function public.assert_geo_ok(
  p_branch_id uuid,
  p_lat double precision,
  p_lon double precision,
  p_accuracy_m double precision
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch public.branches;
  v_distance double precision;
begin
  if p_lat is null or p_lon is null then
    raise exception 'No fue posible obtener tu ubicación.';
  end if;
  select * into v_branch from public.branches where id = p_branch_id;
  if not found then
    raise exception 'La sucursal no existe.';
  end if;
  if not v_branch.active then
    raise exception 'La sucursal está inactiva. Contacta al administrador.';
  end if;
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians((p_lat - v_branch.lat) / 2)), 2) +
    cos(radians(v_branch.lat)) * cos(radians(p_lat)) *
    power(sin(radians((p_lon - v_branch.lon) / 2)), 2)
  )) into v_distance;
  if v_distance > (v_branch.radius_m + least(coalesce(p_accuracy_m, 0), 100)) then
    raise exception
      'Te encuentras a %s m. La sucursal permite un radio de %s m.',
      round(v_distance)::text,
      round((v_branch.radius_m + least(coalesce(p_accuracy_m, 0), 100)))::text;
  end if;
end;
$$;

-- ---------- Estado de la sesión del empleado (fuente de verdad) ----------
create or replace function public.my_session_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.attendance_sessions;
  v_schedule public.schedules;
  v_break_open boolean;
  v_next text;
  v_device jsonb;
  v_entry_exists boolean := false;
  v_local_time time := (now() at time zone public.session_timezone())::time;
  v_entry_allowed boolean := false;
  v_entry_message text;
begin
  select s.* into v_session
  from public.attendance_sessions s
  where s.employee_id = auth.uid() and s.is_open
  order by s.check_in desc
  limit 1;

  select exists (
    select 1 from public.attendance_sessions s
    where s.employee_id = auth.uid()
      and s.check_date = public.session_check_date()
  ) into v_entry_exists;

  if v_session.id is null then
    v_next := 'check_in';
  else
    select exists (
      select 1 from public.attendance a
      where a.session_id = v_session.id and a.check_type = 'break_out'
        and not exists (
          select 1 from public.attendance b
          where b.session_id = a.session_id and b.check_type = 'break_in'
            and b.happened_at > a.happened_at
        )
    ) into v_break_open;

    if v_break_open then
      v_next := 'break_in';
    elsif v_session.break_out_at is null then
      v_next := 'break_out';
    else
      v_next := 'check_out';
    end if;
  end if;

  v_schedule := public.current_schedule_for(auth.uid());
  if v_next <> 'check_in' then
    v_entry_message := 'Ya registraste tu entrada de hoy.';
  elsif v_entry_exists then
    v_entry_message := 'Tu entrada de hoy ya está registrada.';
  elsif v_schedule.id is null then
    v_entry_message := 'No tienes un horario vigente para registrar la entrada. Contacta al administrador.';
  elsif v_local_time < v_schedule.check_in then
    v_entry_message := 'Tu horario de entrada empieza a las ' || to_char(v_schedule.check_in, 'HH24:MI') || '.';
  elsif v_local_time > v_schedule.check_out then
    v_entry_message := 'El horario de entrada terminó a las ' || to_char(v_schedule.check_out, 'HH24:MI') || '.';
  else
    v_entry_allowed := true;
    if v_local_time > v_schedule.check_in + make_interval(mins => v_schedule.tolerance_min) then
      v_entry_message := 'Puedes registrar tu entrada; se marcará como retardo.';
    else
      v_entry_message := 'Ya puedes registrar tu entrada.';
    end if;
  end if;

  select jsonb_build_object(
    'id', d.id,
    'authorization', d.authorization,
    'is_active', d.is_active
  ) into v_device
  from public.devices d
  where d.employee_id = auth.uid() and d.is_active
  order by d.last_seen_at desc nulls last, d.created_at desc
  limit 1;

  return jsonb_build_object(
    'session', case when v_session.id is null then null else to_jsonb(v_session) end,
    'next_check', v_next,
    'device', v_device,
    'entry_window', jsonb_build_object(
      'allowed', v_entry_allowed,
      'already_recorded', v_entry_exists,
      'message', v_entry_message,
      'schedule_name', v_schedule.name,
      'start_time', case when v_schedule.id is null then null else to_char(v_schedule.check_in, 'HH24:MI') end,
      'end_time', case when v_schedule.id is null then null else to_char(v_schedule.check_out, 'HH24:MI') end
    )
  );
end;
$$;

-- ---------- Historial del empleado (con sucursal) ----------
create or replace function public.my_attendance(p_limit int default 30, p_offset int default 0)
returns setof public.attendance_list
language sql
security definer
set search_path = public
as $$
  select s.*
  from public.attendance_list s
  where s.employee_id = auth.uid()
  order by s.check_in desc
  limit p_limit offset p_offset;
$$;

-- ---------- Detalle de una sesión (solo propia) ----------
create or replace function public.attendance_detail(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.attendance_list;
  v_events jsonb;
  v_evidence jsonb;
begin
  if not exists (
    select 1 from public.attendance a
    where a.session_id = p_session_id and a.employee_id = auth.uid()
  ) then
    raise exception 'La checada no existe o no te pertenece.';
  end if;

  select s.* into v_row from public.attendance_list s where s.id = p_session_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'check_type', a.check_type,
    'happened_at', a.happened_at,
    'status', a.status,
    'photo_url', a.photo_url,
    'lat', a.lat,
    'lon', a.lon,
    'accuracy_m', a.accuracy_m,
    'source', a.source
  ) order by a.happened_at), '[]'::jsonb) into v_events
  from public.attendance a
  where a.session_id = p_session_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'attendance_id', e.attendance_id,
    'kind', e.kind,
    'file_path', e.file_path,
    'uploaded_at', e.uploaded_at
  )), '[]'::jsonb) into v_evidence
  from public.attendance_evidence e
  where e.attendance_id in (
    select a.id from public.attendance a where a.session_id = p_session_id
  );

  return jsonb_build_object(
    'session', to_jsonb(v_row),
    'events', v_events,
    'evidence', v_evidence
  );
end;
$$;

-- ============================================================================
-- Registro de checadas (con idempotencia, dispositivo y geocerca)
-- ============================================================================

-- ---------- Entrada ----------
create or replace function public.record_check_in(
  p_branch_id uuid,
  p_lat double precision default null,
  p_lon double precision default null,
  p_accuracy_m double precision default null,
  p_photo_path text default null,
  p_device_id uuid default null,
  p_idempotency_key uuid default null
)
returns public.attendance_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee public.employees;
  v_branch public.branches;
  v_schedule public.schedules;
  v_now timestamptz := now();
  v_local_time time;
  v_status public.attendance_status := 'on_time';
  v_start_limit time;
  v_session_id uuid := gen_random_uuid();
  v_event_id uuid;
  v_result public.attendance_sessions;
begin
  select * into v_employee from public.employees where id = auth.uid();
  if not found then
    raise exception 'No tienes un perfil de empleado válido.';
  end if;
  if not v_employee.active then
    raise exception 'Tu cuenta está inactiva. Contacta al administrador.';
  end if;

  perform public.assert_device_usable(p_device_id);

  -- Idempotencia: si ya checó entrada hoy, devolver la sesión existente.
  select s.* into v_result
  from public.attendance_sessions s
  where s.employee_id = v_employee.id
    and s.check_date = public.session_check_date();
  if found then
    return v_result;
  end if;

  v_schedule := public.current_schedule_for(v_employee.id);
  if v_schedule.id is null then
    raise exception 'No tienes un horario vigente para registrar la entrada. Contacta al administrador.';
  end if;

  v_local_time := (v_now at time zone public.session_timezone())::time;
  if v_local_time < v_schedule.check_in then
    raise exception 'Tu horario de entrada empieza a las %.', to_char(v_schedule.check_in, 'HH24:MI');
  end if;
  if v_local_time > v_schedule.check_out then
    raise exception 'El horario de entrada terminó a las %.', to_char(v_schedule.check_out, 'HH24:MI');
  end if;

  select * into v_branch from public.branches where id = p_branch_id;
  if not found then
    raise exception 'La sucursal no existe.';
  end if;
  if not v_branch.active then
    raise exception 'La sucursal está inactiva. Contacta al administrador.';
  end if;

  -- Geocerca de sucursal: siempre obligatoria, con precisión acotada por
  -- el servidor (`assert_geo_ok`). El cliente no puede desactivarla ni
  -- inflar la precisión para ampliar el radio.
  perform public.assert_geo_ok(v_branch.id, p_lat, p_lon, p_accuracy_m);

  -- Se permite registrar hasta la hora de salida; después de la tolerancia,
  -- la entrada queda marcada como retardo.
  v_start_limit := v_schedule.check_in + make_interval(mins => v_schedule.tolerance_min);
  if v_local_time > v_start_limit then
    v_status := 'late';
  end if;

  with ins as (
    insert into public.attendance(
      session_id, employee_id, branch_id, device_id, check_type, check_date,
      happened_at, status, lat, lon, accuracy_m, photo_url, source, idempotency_key
    )
    values (
      v_session_id, v_employee.id, v_branch.id, p_device_id, 'check_in', public.session_check_date(),
      v_now, v_status, p_lat, p_lon, p_accuracy_m, p_photo_path, 'mobile',
      coalesce(p_idempotency_key, v_session_id)
    )
    on conflict (employee_id, check_date, check_type) where check_type = 'check_in'
    do nothing
    returning id
  )
  select id into v_event_id from ins;

  if v_event_id is not null and p_photo_path is not null then
    insert into public.attendance_evidence(attendance_id, kind, file_path)
    values (v_event_id, 'photo', p_photo_path);
  end if;

  select s.* into v_result
  from public.attendance_sessions s
  where s.employee_id = v_employee.id
    and s.check_date = public.session_check_date();
  if not found then
    raise exception 'No se pudo registrar la entrada.';
  end if;
  return v_result;
end;
$$;

-- ---------- Salida ----------
create or replace function public.record_check_out(
  p_attendance_id uuid,
  p_photo_path text default null,
  p_lat double precision default null,
  p_lon double precision default null,
  p_accuracy_m double precision default null,
  p_device_id uuid default null,
  p_idempotency_key uuid default null
)
returns public.attendance_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_result public.attendance_sessions;
  v_existing_idem uuid;
begin
  if not exists (
    select 1 from public.attendance a
    where a.session_id = p_attendance_id and a.employee_id = auth.uid()
  ) then
    raise exception 'La checada no existe o no te pertenece.';
  end if;

  -- Evita duplicados por existencia (no solo por idempotency_key): si ya
  -- hubo salida (aunque sea sin clave), un reintento con la MISMA clave
  -- devuelve el resultado existente; una llamada nueva es rechazada.
  if exists (
    select 1 from public.attendance a
    where a.session_id = p_attendance_id and a.check_type = 'check_out'
  ) then
    if p_idempotency_key is not null and exists (
      select 1 from public.attendance a
      where a.session_id = p_attendance_id and a.check_type = 'check_out'
        and a.idempotency_key = p_idempotency_key
    ) then
      select s.* into v_result from public.attendance_sessions s where s.id = p_attendance_id;
      return v_result;
    end if;
    raise exception 'Ya registraste tu salida.';
  end if;

  perform public.assert_device_usable(p_device_id);

  perform public.assert_geo_ok(
    (
      select ci.branch_id from public.attendance ci
      where ci.session_id = p_attendance_id and ci.check_type = 'check_in'
      limit 1
    ),
    p_lat, p_lon, p_accuracy_m
  );

  insert into public.attendance(
    session_id, employee_id, branch_id, device_id, check_type, check_date,
    happened_at, status, lat, lon, accuracy_m, photo_url, source, idempotency_key
  )
  select
    ci.session_id, ci.employee_id, ci.branch_id, p_device_id, 'check_out', ci.check_date,
    now(), 'on_time', p_lat, p_lon, p_accuracy_m, p_photo_path, 'mobile', p_idempotency_key
  from public.attendance ci
  where ci.session_id = p_attendance_id and ci.check_type = 'check_in'
  on conflict (idempotency_key) where idempotency_key is not null
  do nothing
  returning id into v_event_id;

  if v_event_id is not null and p_photo_path is not null then
    insert into public.attendance_evidence(attendance_id, kind, file_path)
    values (v_event_id, 'photo', p_photo_path);
  end if;

  select s.* into v_result
  from public.attendance_sessions s
  where s.id = p_attendance_id;
  if not found then
    raise exception 'No se pudo registrar la salida.';
  end if;
  return v_result;
end;
$$;

-- ---------- Salida a comida (pausa) ----------
create or replace function public.record_break_out(
  p_attendance_id uuid,
  p_photo_path text default null,
  p_lat double precision default null,
  p_lon double precision default null,
  p_accuracy_m double precision default null,
  p_device_id uuid default null,
  p_idempotency_key uuid default null
)
returns public.attendance_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.attendance_sessions;
  v_event_id_for_break uuid;
begin
  if not exists (
    select 1 from public.attendance a
    where a.session_id = p_attendance_id and a.employee_id = auth.uid() and a.check_type = 'check_in'
  ) then
    raise exception 'La checada no existe o no te pertenece.';
  end if;

  -- Guarda por existencia de pausa abierta (no solo por idempotency_key):
  -- un reintento con la MISMA clave es idempotente; una pausa abierta sin
  -- clave (cliente antiguo/otra fuente) también bloquea una nueva.
  if exists (
    select 1 from public.attendance a
    where a.session_id = p_attendance_id and a.check_type = 'break_out'
      and not exists (
        select 1 from public.attendance b
        where b.session_id = a.session_id and b.check_type = 'break_in'
          and b.happened_at > a.happened_at
      )
  ) then
    if p_idempotency_key is not null and exists (
      select 1 from public.attendance a
      where a.session_id = p_attendance_id and a.check_type = 'break_out'
        and a.idempotency_key = p_idempotency_key
        and not exists (
          select 1 from public.attendance b
          where b.session_id = a.session_id and b.check_type = 'break_in'
            and b.happened_at > a.happened_at
        )
    ) then
      select s.* into v_result from public.attendance_sessions s where s.id = p_attendance_id;
      return v_result;
    end if;
    raise exception 'Ya tienes una pausa en curso.';
  end if;

  perform public.assert_device_usable(p_device_id);

  perform public.assert_geo_ok(
    (
      select ci.branch_id from public.attendance ci
      where ci.session_id = p_attendance_id and ci.check_type = 'check_in'
      limit 1
    ),
    p_lat, p_lon, p_accuracy_m
  );

  insert into public.attendance(
    session_id, employee_id, branch_id, device_id, check_type, check_date,
    happened_at, status, lat, lon, accuracy_m, photo_url, source, idempotency_key
  )
  select
    ci.session_id, ci.employee_id, ci.branch_id, p_device_id, 'break_out', ci.check_date,
    now(), 'on_time', p_lat, p_lon, p_accuracy_m, p_photo_path, 'mobile', p_idempotency_key
  from public.attendance ci
  where ci.session_id = p_attendance_id and ci.check_type = 'check_in'
  on conflict (idempotency_key) where idempotency_key is not null
  do nothing
  returning id into v_event_id_for_break;

  if v_event_id_for_break is not null and p_photo_path is not null then
    insert into public.attendance_evidence(attendance_id, kind, file_path)
    values (v_event_id_for_break, 'photo', p_photo_path);
  end if;

  select s.* into v_result from public.attendance_sessions s where s.id = p_attendance_id;
  return v_result;
end;
$$;

-- ---------- Regreso de comida (fin de pausa) ----------
create or replace function public.record_break_in(
  p_attendance_id uuid,
  p_photo_path text default null,
  p_lat double precision default null,
  p_lon double precision default null,
  p_accuracy_m double precision default null,
  p_device_id uuid default null,
  p_idempotency_key uuid default null
)
returns public.attendance_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.attendance_sessions;
  v_break_in_idem uuid;
  v_has_open_break boolean;
  v_event_id_for_break uuid;
begin
  if not exists (
    select 1 from public.attendance a
    where a.session_id = p_attendance_id and a.employee_id = auth.uid() and a.check_type = 'check_in'
  ) then
    raise exception 'La checada no existe o no te pertenece.';
  end if;

  select exists (
    select 1 from public.attendance a
    where a.session_id = p_attendance_id and a.check_type = 'break_out'
      and not exists (
        select 1 from public.attendance b
        where b.session_id = a.session_id and b.check_type = 'break_in'
          and b.happened_at > a.happened_at
      )
  ) into v_has_open_break;

  if not v_has_open_break then
    -- Reintento idempotente: ya se registró el regreso.
    select a.idempotency_key into v_break_in_idem
    from public.attendance a
    where a.session_id = p_attendance_id and a.check_type = 'break_in'
    order by a.happened_at desc limit 1;
    if p_idempotency_key is not null and v_break_in_idem = p_idempotency_key then
      select s.* into v_result from public.attendance_sessions s where s.id = p_attendance_id;
      return v_result;
    end if;
    raise exception 'No tienes una pausa en curso.';
  end if;

  perform public.assert_device_usable(p_device_id);

  perform public.assert_geo_ok(
    (
      select ci.branch_id from public.attendance ci
      where ci.session_id = p_attendance_id and ci.check_type = 'check_in'
      limit 1
    ),
    p_lat, p_lon, p_accuracy_m
  );

  insert into public.attendance(
    session_id, employee_id, branch_id, device_id, check_type, check_date,
    happened_at, status, lat, lon, accuracy_m, photo_url, source, idempotency_key
  )
  select
    ci.session_id, ci.employee_id, ci.branch_id, p_device_id, 'break_in', ci.check_date,
    now(), 'on_time', p_lat, p_lon, p_accuracy_m, p_photo_path, 'mobile', p_idempotency_key
  from public.attendance ci
  where ci.session_id = p_attendance_id and ci.check_type = 'check_in'
  on conflict (idempotency_key) where idempotency_key is not null
  do nothing
  returning id into v_event_id_for_break;

  if v_event_id_for_break is not null and p_photo_path is not null then
    insert into public.attendance_evidence(attendance_id, kind, file_path)
    values (v_event_id_for_break, 'photo', p_photo_path);
  end if;

  select s.* into v_result from public.attendance_sessions s where s.id = p_attendance_id;
  return v_result;
end;
$$;

-- ---------- Solicitudes de permiso / vacaciones / incapacidad ----------
create or replace function public.my_off_requests()
returns setof public.offtime_requests
language sql
security definer
set search_path = public
as $$
  select o.*
  from public.offtime_requests o
  where o.employee_id = auth.uid()
  order by o.created_at desc;
$$;

create or replace function public.request_off(
  p_off_type public.off_type,
  p_starts_on date,
  p_ends_on date,
  p_reason text
)
returns public.offtime_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee public.employees;
  v_result public.offtime_requests;
begin
  select * into v_employee from public.employees where id = auth.uid();
  if not found then
    raise exception 'No tienes un perfil de empleado válido.';
  end if;

  if exists (
    select 1 from public.offtime_requests o
    where o.employee_id = v_employee.id
      and o.status <> 'rejected'
      and o.starts_on <= p_ends_on
      and o.ends_on >= p_starts_on
  ) then
    raise exception 'Ya tienes una solicitud pendiente o aprobada que se traslapa con esas fechas.';
  end if;

  insert into public.offtime_requests(employee_id, off_type, starts_on, ends_on, reason)
  values (v_employee.id, p_off_type, p_starts_on, p_ends_on, p_reason)
  returning * into v_result;
  return v_result;
end;
$$;

create or replace function public.approve_off(
  p_request_id uuid,
  p_approved boolean,
  p_note text default null
)
returns public.offtime_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee public.employees;
  v_target public.offtime_requests;
  v_result public.offtime_requests;
begin
  select * into v_employee from public.employees where id = auth.uid();
  if not found then
    raise exception 'No tienes un perfil de empleado válido.';
  end if;
  if v_employee.role not in ('hr', 'admin') then
    raise exception 'No tienes permiso para aprobar solicitudes.';
  end if;

  select * into v_target from public.offtime_requests where id = p_request_id;
  if v_target.id is null then
    raise exception 'La solicitud no existe.';
  end if;
  if v_target.status <> 'pending' then
    raise exception 'La solicitud ya fue revisada.';
  end if;

  update public.offtime_requests
    set status = case when p_approved then 'approved'::public.approval_status else 'rejected'::public.approval_status end,
        reviewed_by = v_employee.id,
        reviewed_at = now(),
        review_note = p_note
  where id = p_request_id
  returning * into v_result;

  if not found then
    raise exception 'La solicitud no existe.';
  end if;
  return v_result;
end;
$$;

-- ============================================================================
-- 8. RLS + POLÍTICAS
-- Regla: datos sensibles SOLO se tocan vía funciones security definer o con
-- la service_role del backend. Acceso directo de clientes bloqueado.
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'attendance', 'attendance_evidence',
    'offtime_requests', 'incidents', 'audit_logs', 'app_settings',
    'departments', 'positions', 'schedules', 'employee_schedules',
    'devices', 'displays', 'display_playlists', 'media',
    'role_permissions', 'branches', 'employees', 'notifications',
    'announcements', 'display_tokens'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);
  end loop;
end $$;

-- Vistas protegidas también (RLS invoker del llamante).
-- Vistas protegidas vía security_invoker: la RLS del llamante aplica
-- sobre las tablas base (PG15+; ENABLE RLS no aplica a vistas).
alter view public.attendance_sessions set (security_invoker = true);
alter view public.attendance_days set (security_invoker = true);
alter view public.attendance_list set (security_invoker = true);

-- ---------- Políticas de lectura no sensibles ----------

drop policy if exists "read role_permissions" on public.role_permissions;
create policy "read role_permissions"
  on public.role_permissions for select to authenticated
  using (true);

drop policy if exists "read active announcements" on public.announcements;
create policy "read active announcements"
  on public.announcements for select to authenticated
  using (
    active = true
    and published_at <= now()
    and (expires_at is null or expires_at > now())
    and exists (
      select 1 from public.employees e
      where e.id = auth.uid()
        and (audience_role is null or cardinality(audience_role) = 0 or e.role = any(audience_role))
    )
  );

drop policy if exists "read active media" on public.media;
create policy "read active media"
  on public.media for select to authenticated
  using (active = true);

drop policy if exists "read own notifications" on public.notifications;
drop policy if exists "update own notifications" on public.notifications;
create policy "read own notifications"
  on public.notifications for select to authenticated
  using (user_id = auth.uid());

create policy "update own notifications"
  on public.notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================================
-- 9. AUDITORÍA
-- ============================================================================
create or replace function public.write_audit_log(
  p_action text,
  p_entity text,
  p_entity_id uuid default null,
  p_old_data jsonb default null,
  p_new_data jsonb default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee public.employees;
begin
  select * into v_employee from public.employees where id = auth.uid();
  insert into public.audit_logs(
    actor_id, actor_role, action, entity, entity_id,
    old_data, new_data, metadata
  )
  values (
    auth.uid(),
    case when v_employee.id is null then null else v_employee.role::text end,
    p_action, p_entity, p_entity_id,
    p_old_data, p_new_data, p_metadata
  );
end;
$$;

-- Trigger de auditoría sobre asistencias. Respeta `app.skip_attendance_audit`
-- (las correcciones vía RPC escriben su propia entrada con actor).
create or replace function public.audit_attendance_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.skip_attendance_audit', true) = 'on' then
    return coalesce(new, old);
  end if;
  perform public.write_audit_log(
    tg_op,
    'attendance',
    coalesce(new.id, old.id),
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    jsonb_build_object(
      'session_id', coalesce(new.session_id, old.session_id),
      'employee_id', coalesce(new.employee_id, old.employee_id),
      'check_type', coalesce(new.check_type, old.check_type)
    )
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_attendance_audit on public.attendance;
create trigger trg_attendance_audit
  after insert or update or delete on public.attendance
  for each row execute function public.audit_attendance_change();

-- Escritura de auditoría con actor explícito (backend service_role).
create or replace function public.admin_write_audit(
  p_actor_id uuid,
  p_action text,
  p_entity text,
  p_entity_id uuid default null,
  p_old_data jsonb default null,
  p_new_data jsonb default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if p_actor_id is null then
    raise exception 'Se requiere un actor válido para auditar.';
  end if;
  select role::text into v_role from public.employees where id = p_actor_id;
  if v_role is null then
    raise exception 'El actor no es un empleado válido.';
  end if;
  insert into public.audit_logs(
    actor_id, actor_role, action, entity, entity_id,
    old_data, new_data, metadata
  )
  values (
    p_actor_id, v_role, p_action, p_entity, p_entity_id,
    p_old_data, p_new_data, p_metadata
  );
end;
$$;

-- ============================================================================
-- 10. DISPLAYS (Smart Display / TV)
-- ============================================================================
create or replace function public.display_hash_token(p_display_id uuid, p_token text)
returns text
language sql
immutable
security definer
set search_path = public
as $$
  select encode(
    extensions.digest(convert_to(p_display_id::text || ':' || coalesce(p_token, ''), 'UTF8'), 'sha256'),
    'hex'
  );
$$;

create or replace function public.assert_display_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    if not exists (
      select 1 from public.employees e
      where e.id = auth.uid() and e.role in ('admin', 'hr')
    ) then
      raise exception 'No tienes permisos para administrar pantallas.';
    end if;
  end if;
end;
$$;

create or replace function public.display_token_rotate(p_display_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw text := encode(extensions.gen_random_bytes(24), 'hex');
  v_token_id uuid;
begin
  perform public.assert_display_admin();

  if not exists (select 1 from public.displays where id = p_display_id) then
    raise exception 'La pantalla no existe.';
  end if;

  update public.display_tokens
    set active = false, revoked_at = now()
    where display_id = p_display_id and active;

  insert into public.display_tokens (display_id, token_hash, created_by)
  values (p_display_id, public.display_hash_token(p_display_id, v_raw), auth.uid())
  returning id into v_token_id;

  return jsonb_build_object(
    'token', v_raw,
    'display_id', p_display_id,
    'token_id', v_token_id
  );
end;
$$;

create or replace function public.display_token_revoke(p_token_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_display_admin();
  update public.display_tokens
    set active = false, revoked_at = now()
    where id = p_token_id and active;
end;
$$;

create or replace function public.display_token_revoke_all(p_display_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_display_admin();
  update public.display_tokens
    set active = false, revoked_at = now()
    where display_id = p_display_id and active;
end;
$$;

create or replace function public.display_authenticate(p_code text, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display public.displays;
  v_token public.display_tokens;
begin
  select d.* into v_display
  from public.displays d
  where d.code = upper(trim(coalesce(p_code, '')));
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'display_not_found');
  end if;

  if not v_display.is_active then
    return jsonb_build_object('ok', false, 'reason', 'display_inactive');
  end if;

  select t.* into v_token
  from public.display_tokens t
  where t.display_id = v_display.id
    and t.token_hash = public.display_hash_token(v_display.id, p_token)
  order by t.created_at desc
  limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'token_invalid');
  end if;
  if not v_token.active then
    return jsonb_build_object('ok', false, 'reason', 'token_revoked');
  end if;

  update public.display_tokens set last_used_at = now() where id = v_token.id;

  return jsonb_build_object(
    'ok', true,
    'display', jsonb_build_object(
      'id', v_display.id,
      'name', v_display.name,
      'code', v_display.code,
      'status', v_display.status,
      'is_active', v_display.is_active,
      'branch_id', v_display.branch_id,
      'settings', v_display.settings
    ),
    'token_id', v_token.id
  );
end;
$$;

create or replace function public.display_heartbeat(p_display_id uuid, p_online boolean, p_software text default null, p_os_version text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.displays
    set last_seen_at = now(),
        status = case when p_online then 'online' else 'offline' end,
        software = coalesce(p_software, software),
        os_version = coalesce(p_os_version, os_version)
    where id = p_display_id;
end;
$$;

-- Snapshot del tablero (agregados por sucursal; sin datos sensibles).
create or replace function public.display_snapshot(p_display_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display public.displays;
  v_today date := public.session_check_date();
  v_total int;
  v_present int;
  v_late int;
  v_excused int;
  v_missing int;
  v_last_checks jsonb;
  v_announcements jsonb;
  v_playlist jsonb;
begin
  select d.* into v_display from public.displays d where d.id = p_display_id;
  if not found then
    raise exception 'La pantalla no existe.';
  end if;

  select count(*) into v_total
  from public.employees e
  where e.branch_id = v_display.branch_id and e.active;

  select count(distinct a.employee_id) into v_present
  from public.attendance a
  where a.branch_id = v_display.branch_id
    and a.check_type = 'check_in'
    and a.check_date = v_today;

  select count(distinct a.session_id) into v_late
  from public.attendance a
  where a.branch_id = v_display.branch_id
    and a.check_type = 'check_in'
    and a.check_date = v_today
    and a.status = 'late';

  select count(*) into v_excused
  from public.offtime_requests o
  join public.employees e on e.id = o.employee_id
  where e.branch_id = v_display.branch_id
    and e.active
    and o.status = 'approved'
    and v_today between o.starts_on and o.ends_on;

  v_missing := greatest(v_total - v_present - v_excused, 0);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id,
    'name', x.name,
    'check_type', x.check_type,
    'label', x.label,
    'time', x.time,
    'full_time', x.full_time,
    'status', x.status
  ) order by x.happened_at desc), '[]'::jsonb) into v_last_checks
  from (
    select
      a.id,
      e.full_name as name,
      a.check_type::text as check_type,
      case a.check_type
        when 'check_in' then 'ENTRADA'
        when 'check_out' then 'SALIDA'
        when 'break_out' then 'SALIDA COMIDA'
        when 'break_in' then 'REGRESO COMIDA'
      end as label,
      to_char((a.happened_at at time zone public.session_timezone()), 'HH24:MI') as time,
      to_char((a.happened_at at time zone public.session_timezone()), 'HH24:MI:SS') as full_time,
      a.status::text as status,
      a.happened_at
    from public.attendance a
    join public.employees e on e.id = a.employee_id
    where a.branch_id = v_display.branch_id
      and a.check_date = v_today
    order by a.happened_at desc
    limit 8
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', an.id,
    'title', an.title,
    'body', an.body
  ) order by an.published_at desc), '[]'::jsonb) into v_announcements
  from public.announcements an
  where an.active
    and an.published_at <= now()
    and (an.expires_at is null or an.expires_at > now())
    and an.audience_role @> array['employee'::public.employee_role];

  select coalesce(jsonb_agg(jsonb_build_object(
    'position', p.position,
    'item_type', p.item_type,
    'item_id', p.item_id,
    'duration_s', p.duration_s,
    'announcement', p.announcement,
    'media', p.media
  ) order by p.position), '[]'::jsonb) into v_playlist
  from (
    select
      pl.position,
      pl.item_type,
      pl.item_id,
      pl.duration_s,
      case when pl.item_type = 'announcement' then (
        select jsonb_build_object('id', an.id, 'title', an.title, 'body', an.body)
        from public.announcements an
        where an.id = pl.item_id and an.active
      ) else null end as announcement,
      case when pl.item_type = 'media' then (
        select jsonb_build_object(
          'id', md.id,
          'kind', md.kind::text,
          'title', md.title,
          'file_path', md.file_path,
          'url', md.url,
          'mime_type', md.mime_type,
          'duration_s', md.duration_s
        )
        from public.media md
        where md.id = pl.item_id and md.active
      ) else null end as media
    from public.display_playlists pl
    where pl.display_id = v_display.id and pl.active
  ) p
  where p.announcement is not null or p.media is not null;

  return jsonb_build_object(
    'display_id', v_display.id,
    'generated_at', now(),
    'branch', jsonb_build_object(
      'id', v_display.branch_id,
      'name', (select b.name from public.branches b where b.id = v_display.branch_id),
      'address', (select b.address from public.branches b where b.id = v_display.branch_id)
    ),
    'counts', jsonb_build_object(
      'total', v_total,
      'present', v_present,
      'late', v_late,
      'excused', v_excused,
      'missing', v_missing
    ),
    'last_checks', v_last_checks,
    'announcements', v_announcements,
    'playlist', v_playlist,
    'config', jsonb_build_object(
      'stats_s', coalesce((v_display.settings #>> '{stats_seconds}')::int, 10),
      'announcement_s', coalesce((v_display.settings #>> '{announcement_seconds}')::int, 8),
      'media_s', coalesce((v_display.settings #>> '{media_seconds}')::int, 20),
      'check_overlay_s', coalesce((v_display.settings #>> '{check_overlay_seconds}')::int, 6)
    )
  );
end;
$$;

-- ============================================================================
-- Admin (panel) — RPC del backend con actor explícito
-- ============================================================================
create or replace function public.admin_dashboard_summary(p_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := coalesce(p_date, public.session_check_date());
  v_total int;
  v_present int;
  v_late int;
  v_excused int;
  v_open_sessions int;
  v_missing int;
  v_pending_off int;
  v_open_incidents int;
  v_series jsonb;
begin
  select count(*) into v_total
  from public.employees where active and role = 'employee';

  select count(distinct a.employee_id) into v_present
  from public.attendance a
  where a.check_type = 'check_in' and a.check_date = v_day;

  select count(distinct a.employee_id) into v_late
  from public.attendance a
  where a.check_type = 'check_in' and a.check_date = v_day and a.status = 'late';

  select count(distinct o.employee_id) into v_excused
  from public.offtime_requests o
  where o.status = 'approved' and v_day between o.starts_on and o.ends_on;

  select count(distinct s.id) into v_open_sessions
  from public.attendance_sessions s
  where s.check_date = v_day and s.is_open;

  v_missing := greatest(v_total - v_present - v_excused, 0);

  select count(*) into v_pending_off
  from public.offtime_requests where status = 'pending';

  select count(*) into v_open_incidents
  from public.incidents where status = 'open';

  select coalesce(jsonb_agg(jsonb_build_object(
    'date', d.day,
    'present', (select count(distinct a.employee_id)
                from public.attendance a
                where a.check_type = 'check_in' and a.check_date = d.day),
    'late', (select count(distinct a.employee_id)
             from public.attendance a
             where a.check_type = 'check_in' and a.check_date = d.day and a.status = 'late'),
    'missing', greatest(
      v_total
      - (select count(distinct a.employee_id)
         from public.attendance a
         where a.check_type = 'check_in' and a.check_date = d.day)
      - (select count(distinct o.employee_id)
         from public.offtime_requests o
         where o.status = 'approved' and d.day between o.starts_on and o.ends_on),
      0)
  ) order by d.day), '[]'::jsonb) into v_series
  from (select generate_series(v_day - 6, v_day, interval '1 day')::date as day) d;

  return jsonb_build_object(
    'date', v_day,
    'counts', jsonb_build_object(
      'total', v_total,
      'present', v_present,
      'late', v_late,
      'excused', v_excused,
      'open_sessions', v_open_sessions,
      'missing', v_missing
    ),
    'queues', jsonb_build_object(
      'pending_offtime', v_pending_off,
      'open_incidents', v_open_incidents
    ),
    'series', v_series
  );
end;
$$;

-- Búsqueda/paginado de asistencias (incluye "missing" del día).
create or replace function public.admin_attendance_search(
  p_from date default null,
  p_to date default null,
  p_employee_id uuid default null,
  p_department_id uuid default null,
  p_branch_id uuid default null,
  p_status text default null,
  p_search text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from date := coalesce(p_from, public.session_check_date());
  v_to date := coalesce(p_to, v_from);
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_rows jsonb;
  v_total int;
begin
  if v_from > v_to then
    raise exception 'El rango de fechas no es válido.';
  end if;

  with present_rows as (
    select
      e.id as employee_id, d.check_date, d.check_in, d.check_out,
      d.minutes_worked, d.status::text as day_status, e.code, e.full_name,
      e.photo_url, e.department_id, dep.name as department_name,
      b.name as branch_name, s.id as session_id
    from public.attendance_days d
    join public.employees e on e.id = d.employee_id
    left join public.departments dep on dep.id = e.department_id
    left join public.branches b on b.id = e.branch_id
    left join public.attendance_list s on s.employee_id = e.id and s.check_date = d.check_date
    where d.check_date between v_from and v_to
      and (p_employee_id is null or e.id = p_employee_id)
      and (p_department_id is null or e.department_id = p_department_id)
      and (p_branch_id is null or e.branch_id = p_branch_id)
      and (p_status is null or p_status = 'all' or d.status::text = p_status
           or (p_status = 'present' and d.status in ('on_time', 'late', 'out_of_window')))
      and (
        p_search is null
        or e.code ilike '%' || p_search || '%'
        or e.full_name ilike '%' || p_search || '%'
      )
  ),
  missing_rows as (
    select
      e.id as employee_id, v_from as check_date,
      null::timestamptz as check_in, null::timestamptz as check_out,
      null::numeric as minutes_worked, 'missing' as day_status,
      e.code, e.full_name, e.photo_url, e.department_id,
      dep.name as department_name, b.name as branch_name,
      null::uuid as session_id
    from public.employees e
    left join public.departments dep on dep.id = e.department_id
    left join public.branches b on b.id = e.branch_id
    where e.active
      and (p_employee_id is null or e.id = p_employee_id)
      and (p_department_id is null or e.department_id = p_department_id)
      and (p_branch_id is null or e.branch_id = p_branch_id)
      and (
        p_search is null
        or e.code ilike '%' || p_search || '%'
        or e.full_name ilike '%' || p_search || '%'
      )
      and not exists (
        select 1 from public.attendance_days d
        where d.employee_id = e.id and d.check_date between v_from and v_to
      )
      and not exists (
        select 1 from public.offtime_requests o
        where o.employee_id = e.id and o.status = 'approved'
          and o.starts_on <= v_to and o.ends_on >= v_from
      )
  ),
  combined as (
    select * from present_rows
    union all
    select * from missing_rows
  ),
  filtered as (
    select
      count(*) over () as total,
      r.*
    from combined r
    where p_status is null or p_status = 'all'
      or day_status = p_status
      or (p_status = 'present' and day_status in ('on_time', 'late', 'out_of_window'))
  )
  select
    coalesce(max(total), 0)                                                                              into v_total
  from filtered;

  select coalesce(jsonb_agg(jsonb_build_object(
      'employee_id', employee_id,
      'code', code,
      'full_name', full_name,
      'photo_url', photo_url,
      'department_id', department_id,
      'department_name', department_name,
      'branch_name', branch_name,
      'check_date', check_date,
      'check_in', check_in,
      'check_out', check_out,
      'minutes_worked', minutes_worked,
      'day_status', day_status,
      'session_id', session_id
    ) order by full_name), '[]'::jsonb) into v_rows
  from (
    select employee_id, check_date, check_in, check_out, minutes_worked,
           day_status, code, full_name, photo_url, department_id,
           department_name, branch_name, session_id
    from combined c
    where p_status is null or p_status = 'all' or c.day_status = p_status
      or (p_status = 'present' and c.day_status in ('on_time', 'late', 'out_of_window'))
    order by full_name, check_date
    limit v_limit offset v_offset
  ) page;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

create or replace function public.admin_attendance_detail(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.attendance_list;
  v_events jsonb;
  v_evidence jsonb;
begin
  select s.* into v_row from public.attendance_list s where s.id = p_session_id;
  if v_row.id is null then
    raise exception 'La checada no existe.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'check_type', a.check_type,
    'happened_at', a.happened_at,
    'status', a.status,
    'photo_url', a.photo_url,
    'lat', a.lat,
    'lon', a.lon,
    'accuracy_m', a.accuracy_m,
    'source', a.source,
    'note', a.note
  ) order by a.happened_at), '[]'::jsonb) into v_events
  from public.attendance a
  where a.session_id = p_session_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'attendance_id', e.attendance_id,
    'kind', e.kind,
    'file_path', e.file_path,
    'mime_type', e.mime_type,
    'uploaded_at', e.uploaded_at
  )), '[]'::jsonb) into v_evidence
  from public.attendance_evidence e
  where e.attendance_id in (
    select a.id from public.attendance a where a.session_id = p_session_id
  );

  return jsonb_build_object('session', to_jsonb(v_row), 'events', v_events, 'evidence', v_evidence);
end;
$$;

-- Corrección manual de un evento (motivo obligatorio; audita completo).
create or replace function public.admin_edit_attendance(
  p_event_id uuid,
  p_happened_at timestamptz default null,
  p_status public.attendance_status default null,
  p_motivo text default null,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.attendance;
  v_new public.attendance;
begin
  if p_happened_at is null and p_status is null then
    raise exception 'Debes indicar al menos una hora o un estatus nuevo.';
  end if;
  if p_status is not null and p_status = 'excused' then
    raise exception 'El estatus "justificado" se resuelve con una solicitud de permiso aprobada, no editando la checada.';
  end if;

  select * into v_old from public.attendance where id = p_event_id;
  if v_old.id is null then
    raise exception 'El evento de asistencia no existe.';
  end if;

  perform set_config('app.skip_attendance_audit', 'on', true);

  update public.attendance
    set happened_at = coalesce(p_happened_at, happened_at),
        status = coalesce(p_status, status),
        note = case when p_motivo is not null then p_motivo else note end
    where id = p_event_id
    returning * into v_new;

  perform set_config('app.skip_attendance_audit', 'off', true);

  perform public.admin_write_audit(
    p_actor_id,
    'MODIFIED',
    'attendance',
    p_event_id,
    jsonb_build_object(
      'happened_at', v_old.happened_at,
      'status', to_jsonb(v_old.status::text)
    ),
    jsonb_build_object(
      'happened_at', v_new.happened_at,
      'status', to_jsonb(v_new.status::text)
    ),
    jsonb_build_object(
      'session_id', v_old.session_id,
      'employee_id', v_old.employee_id,
      'check_type', v_old.check_type::text,
      'motivo', coalesce(p_motivo, '')
    )
  );

  return to_jsonb(v_new);
end;
$$;

create or replace function public.admin_create_off(
  p_employee_id uuid,
  p_off_type public.off_type,
  p_starts_on date,
  p_ends_on date,
  p_reason text,
  p_actor_id uuid default null
)
returns public.offtime_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.offtime_requests;
begin
  if p_ends_on < p_starts_on then
    raise exception 'La fecha de fin no puede ser anterior al inicio.';
  end if;
  if exists (
    select 1 from public.offtime_requests o
    where o.employee_id = p_employee_id
      and o.status <> 'rejected'
      and o.starts_on <= p_ends_on
      and o.ends_on >= p_starts_on
  ) then
    raise exception 'Ya existe una solicitud pendiente o aprobada que se traslapa con esas fechas.';
  end if;

  insert into public.offtime_requests(employee_id, off_type, starts_on, ends_on, reason)
  values (p_employee_id, p_off_type, p_starts_on, p_ends_on, p_reason)
  returning * into v_result;

  perform public.admin_write_audit(
    p_actor_id, 'CREATE', 'offtime_requests', v_result.id,
    null, to_jsonb(v_result),
    jsonb_build_object('employee_id', p_employee_id, 'off_type', p_off_type::text)
  );
  return v_result;
end;
$$;

create or replace function public.admin_review_off(
  p_request_id uuid,
  p_approved boolean,
  p_note text default null,
  p_actor_id uuid default null
)
returns public.offtime_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.offtime_requests;
  v_result public.offtime_requests;
begin
  select * into v_old from public.offtime_requests where id = p_request_id;
  if v_old.id is null then
    raise exception 'La solicitud no existe.';
  end if;
  if v_old.status <> 'pending' then
    raise exception 'La solicitud ya fue revisada.';
  end if;

  update public.offtime_requests
    set status = case when p_approved then 'approved'::public.approval_status else 'rejected'::public.approval_status end,
        reviewed_by = p_actor_id,
        reviewed_at = now(),
        review_note = coalesce(p_note, review_note)
    where id = p_request_id
    returning * into v_result;

  perform public.admin_write_audit(
    p_actor_id, 'REVIEWED', 'offtime_requests', v_result.id,
    to_jsonb(v_old), to_jsonb(v_result),
    jsonb_build_object('employee_id', v_result.employee_id, 'approved', p_approved)
  );
  return v_result;
end;
$$;

create or replace function public.admin_create_incident(
  p_employee_id uuid,
  p_incident_type public.incident_type,
  p_severity text default 'info',
  p_detail jsonb default '{}'::jsonb,
  p_actor_id uuid default null
)
returns public.incidents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.incidents;
begin
  if p_severity not in ('info', 'warning', 'critical') then
    raise exception 'Severidad inválida.';
  end if;
  insert into public.incidents(employee_id, incident_type, severity, detail)
  values (p_employee_id, p_incident_type, p_severity, coalesce(p_detail, '{}'::jsonb))
  returning * into v_result;

  perform public.admin_write_audit(
    p_actor_id, 'CREATE', 'incidents', v_result.id,
    null, to_jsonb(v_result),
    jsonb_build_object('employee_id', p_employee_id, 'incident_type', p_incident_type::text)
  );
  return v_result;
end;
$$;

create or replace function public.admin_resolve_incident(
  p_incident_id uuid,
  p_note text default null,
  p_actor_id uuid default null
)
returns public.incidents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.incidents;
  v_result public.incidents;
begin
  select * into v_old from public.incidents where id = p_incident_id;
  if v_old.id is null then
    raise exception 'La incidencia no existe.';
  end if;

  update public.incidents
    set status = 'resolved',
        resolved_by = p_actor_id,
        resolved_at = now(),
        detail = detail || jsonb_build_object('resolution_note', coalesce(p_note, ''))
    where id = p_incident_id
    returning * into v_result;

  perform public.admin_write_audit(
    p_actor_id, 'RESOLVED', 'incidents', v_result.id,
    to_jsonb(v_old), to_jsonb(v_result),
    jsonb_build_object('employee_id', v_result.employee_id, 'incident_type', v_result.incident_type::text)
  );
  return v_result;
end;
$$;

create or replace function public.admin_set_display_active(
  p_display_id uuid,
  p_active boolean,
  p_actor_id uuid default null
)
returns public.displays
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.displays;
  v_result public.displays;
begin
  select * into v_old from public.displays where id = p_display_id;
  if v_old.id is null then
    raise exception 'La pantalla no existe.';
  end if;

  update public.displays
    set is_active = p_active
    where id = p_display_id
    returning * into v_result;

  perform public.admin_write_audit(
    p_actor_id, 'UPDATED', 'displays', v_result.id,
    to_jsonb(v_old), to_jsonb(v_result),
    jsonb_build_object('name', v_result.name, 'is_active', p_active)
  );
  return v_result;
end;
$$;

-- ============================================================================
-- 11. STORAGE + POLÍTICAS DE OBJETOS
-- Buckets privados: el backend firma URLs de corta duración.
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('attendance-evidence', 'attendance-evidence', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('media',  'media',  false, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']),
  ('avatars','avatars',false,  5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Evidencias: el empleado sube SOLO a su carpeta (owner = auth.uid()).
drop policy if exists "employees upload own evidence" on storage.objects;
create policy "employees upload own evidence"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attendance-evidence'
    and (owner = auth.uid())
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Lectura SOLO de la propia carpeta (para firmar con su JWT).
drop policy if exists "read own evidence" on storage.objects;
create policy "read own evidence"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'attendance-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- 12. REALTIME (publicación para el flujo push de la TV)
-- ============================================================================
do $$ begin
  alter publication supabase_realtime add table public.attendance;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.announcements;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.media;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.display_playlists;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.displays;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.display_tokens;
exception when duplicate_object then null; end $$;

alter table public.attendance replica identity full;

-- ============================================================================
-- 13. GRANTS / REVOKES
-- ============================================================================

-- ---------- Funciones de empleado: solo authenticated ----------
revoke execute on function public.employee_profile() from anon, public;
revoke execute on function public.my_open_attendance() from anon, public;
revoke execute on function public.my_attendance(int, int) from anon, public;
revoke execute on function public.record_check_in(uuid, double precision, double precision, double precision, text, uuid, uuid) from anon, public;
revoke execute on function public.record_check_out(uuid, text, double precision, double precision, double precision, uuid, uuid) from anon, public;
revoke execute on function public.record_break_out(uuid, text, double precision, double precision, double precision, uuid, uuid) from anon, public;
revoke execute on function public.record_break_in(uuid, text, double precision, double precision, double precision, uuid, uuid) from anon, public;
revoke execute on function public.my_off_requests() from anon, public;
revoke execute on function public.request_off(public.off_type, date, date, text) from anon, public;
revoke execute on function public.approve_off(uuid, boolean, text) from anon, public;
revoke execute on function public.register_device(text, text, text, text, text, text) from anon, public;
revoke execute on function public.my_session_state() from anon, public;
revoke execute on function public.attendance_detail(uuid) from anon, public;
revoke execute on function public.session_timezone() from anon, public;
revoke execute on function public.session_check_date() from anon, public;
revoke execute on function public.current_schedule_for(uuid) from anon, public;
revoke execute on function public.write_audit_log(text, text, uuid, jsonb, jsonb, jsonb) from anon, public, authenticated;
revoke execute on function public.audit_attendance_change() from anon, public, authenticated;
revoke execute on function public.assert_device_usable(uuid) from anon, public, authenticated;
revoke execute on function public.assert_geo_ok(uuid, double precision, double precision, double precision) from anon, public, authenticated;

grant execute on function public.employee_profile() to authenticated;
grant execute on function public.my_open_attendance() to authenticated;
grant execute on function public.my_attendance(int, int) to authenticated;
grant execute on function public.record_check_in(uuid, double precision, double precision, double precision, text, uuid, uuid) to authenticated;
grant execute on function public.record_check_out(uuid, text, double precision, double precision, double precision, uuid, uuid) to authenticated;
grant execute on function public.record_break_out(uuid, text, double precision, double precision, double precision, uuid, uuid) to authenticated;
grant execute on function public.record_break_in(uuid, text, double precision, double precision, double precision, uuid, uuid) to authenticated;
grant execute on function public.my_off_requests() to authenticated;
grant execute on function public.request_off(public.off_type, date, date, text) to authenticated;
grant execute on function public.approve_off(uuid, boolean, text) to authenticated;
grant execute on function public.register_device(text, text, text, text, text, text) to authenticated;
grant execute on function public.my_session_state() to authenticated;
grant execute on function public.attendance_detail(uuid) to authenticated;
grant execute on function public.session_timezone() to authenticated;

-- ---------- Funciones de display: solo service_role ----------
revoke execute on function public.display_hash_token(uuid, text) from anon, authenticated, public;
revoke execute on function public.assert_display_admin() from anon, authenticated, public;
revoke execute on function public.display_token_rotate(uuid) from anon, authenticated, public;
revoke execute on function public.display_token_revoke(uuid) from anon, authenticated, public;
revoke execute on function public.display_token_revoke_all(uuid) from anon, authenticated, public;
revoke execute on function public.display_authenticate(text, text) from anon, authenticated, public;
revoke execute on function public.display_heartbeat(uuid, boolean, text, text) from anon, authenticated, public;
revoke execute on function public.display_snapshot(uuid) from anon, authenticated, public;

grant execute on function public.display_hash_token(uuid, text) to service_role;
grant execute on function public.assert_display_admin() to service_role;
grant execute on function public.display_token_rotate(uuid) to service_role;
grant execute on function public.display_token_revoke(uuid) to service_role;
grant execute on function public.display_token_revoke_all(uuid) to service_role;
grant execute on function public.display_authenticate(text, text) to service_role;
grant execute on function public.display_heartbeat(uuid, boolean, text, text) to service_role;
grant execute on function public.display_snapshot(uuid) to service_role;

-- ---------- Funciones admin: solo service_role ----------
revoke execute on function public.admin_write_audit(uuid, text, text, uuid, jsonb, jsonb, jsonb) from anon, authenticated, public;
revoke execute on function public.admin_dashboard_summary(date) from anon, authenticated, public;
revoke execute on function public.admin_attendance_search(date, date, uuid, uuid, uuid, text, text, int, int) from anon, authenticated, public;
revoke execute on function public.admin_attendance_detail(uuid) from anon, authenticated, public;
revoke execute on function public.admin_edit_attendance(uuid, timestamptz, public.attendance_status, text, uuid) from anon, authenticated, public;
revoke execute on function public.admin_create_off(uuid, public.off_type, date, date, text, uuid) from anon, authenticated, public;
revoke execute on function public.admin_review_off(uuid, boolean, text, uuid) from anon, authenticated, public;
revoke execute on function public.admin_create_incident(uuid, public.incident_type, text, jsonb, uuid) from anon, authenticated, public;
revoke execute on function public.admin_resolve_incident(uuid, text, uuid) from anon, authenticated, public;
revoke execute on function public.admin_set_display_active(uuid, boolean, uuid) from anon, authenticated, public;

grant execute on function public.admin_write_audit(uuid, text, text, uuid, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.admin_dashboard_summary(date) to service_role;
grant execute on function public.admin_attendance_search(date, date, uuid, uuid, uuid, text, text, int, int) to service_role;
grant execute on function public.admin_attendance_detail(uuid) to service_role;
grant execute on function public.admin_edit_attendance(uuid, timestamptz, public.attendance_status, text, uuid) to service_role;
grant execute on function public.admin_create_off(uuid, public.off_type, date, date, text, uuid) to service_role;
grant execute on function public.admin_review_off(uuid, boolean, text, uuid) to service_role;
grant execute on function public.admin_create_incident(uuid, public.incident_type, text, jsonb, uuid) to service_role;
grant execute on function public.admin_resolve_incident(uuid, text, uuid) to service_role;
grant execute on function public.admin_set_display_active(uuid, boolean, uuid) to service_role;

-- ---------- Select a catálogos de UI ----------
grant select on public.role_permissions to authenticated;
grant select on public.announcements to authenticated;
grant select on public.media to authenticated;
grant select on public.notifications to authenticated;

-- ---------- Seed del catálogo RBAC ----------
insert into public.role_permissions (role, action) values
  ('admin',   '*'),
  ('admin',   'displays.manage'),
  ('hr',      'employees.read'),
  ('hr',      'employees.write'),
  ('hr',      'attendance.read'),
  ('hr',      'attendance.manage'),
  ('hr',      'reports.export'),
  ('hr',      'offtime.approve'),
  ('hr',      'incidents.manage'),
  ('hr',      'announcements.write'),
  ('hr',      'announcements.read'),
  ('hr',      'media.write'),
  ('hr',      'media.read'),
  ('hr',      'displays.read'),
  ('hr',      'audit.read'),
  ('hr',      'branches.read'),
  ('hr',      'branches.write'),
  ('hr',      'departments.read'),
  ('hr',      'positions.read'),
  ('hr',      'positions.write'),
  ('hr',      'schedules.read'),
  ('hr',      'schedules.assign'),
  ('hr',      'files.read'),
  ('employee','attendance.self'),
  ('employee','offtime.request'),
  ('employee','profile.self'),
  ('employee','files.attendance.self')
on conflict do nothing;

-- ============================================================================
-- 14. HARDENING (índices de consultas calientes + constraints)
-- ============================================================================
create index if not exists attendance_branch_date_type_idx
  on public.attendance (branch_id, check_date, check_type);

create index if not exists offtime_employee_status_idx
  on public.offtime_requests (employee_id, status);
create index if not exists offtime_starts_ends_idx
  on public.offtime_requests (starts_on, ends_on);

create index if not exists media_active_idx on public.media (active);
create index if not exists announcements_expires_idx on public.announcements (expires_at);

create index if not exists devices_authorization_idx on public.devices ("authorization");

create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at);

create index if not exists incidents_severity_idx on public.incidents (severity);

do $$
begin
  alter table public.branches
    add constraint branches_radius_positive check (radius_m >= 0);
exception when duplicate_object then null; end $$;

do $$
begin
  alter table public.branches
    add constraint branches_lat_range check (lat between -90 and 90),
    add constraint branches_lon_range check (lon between -180 and 180);
exception when duplicate_object then null; end $$;

do $$
begin
  alter table public.offtime_requests
    add constraint offtime_dates_ordered check (ends_on >= starts_on);
exception when duplicate_object then null; end $$;

do $$
begin
  alter table public.announcements
    add constraint announcements_expires_after_publish check (expires_at is null or published_at is null or expires_at >= published_at);
exception when duplicate_object then null; end $$;

do $$
begin
  alter table public.attendance
    add constraint attendance_accuracy_non_negative check (accuracy_m is null or accuracy_m >= 0);
exception when duplicate_object then null; end $$;

-- ============================================================================
-- NOTAS DE OPERACIÓN (housekeeping / retención)
-- Revisa periódicamente (cron mensual) y con retención definida por el
-- negocio antes de aplicar housekeeping:
--   delete from public.audit_logs where created_at < now() - interval '12 months';
--   delete from public.attendance where check_date < now() - interval '24 months';
--   delete from public.attendance_evidence where uploaded_at < (retención evidencias);
-- Los buckets de evidencia/media requieren política de retención acordada
-- con RRHH (ver docs/fase5-produccion.md).
-- ============================================================================
-- FIN DEL ESQUEMA MAESTRO
