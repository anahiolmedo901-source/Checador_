-- ============================================================
-- Checador 0004 — Asistencias por sesión/eventos, evidencias,
-- permisos/ausencias e incidencias.
-- Reemplaza el modelo viejo (tabla `attendance` plana + `shifts`).
-- ============================================================

-- ---------- Configuración de la aplicación ----------
-- Zona horaria usada para derivar `check_date` (día laboral local).
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value)
values ('default_timezone', '"America/Mexico_City"')
on conflict (key) do update set value = excluded.value, updated_at = now();

-- Zona horaria activa (sobrescribible desde el panel admin).
create or replace function public.session_timezone()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select value #>> '{}' from public.app_settings where key = 'default_timezone'),
    'America/Mexico_City'
  );
$$;

-- Día laboral local actual.
create or replace function public.session_check_date()
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (now() at time zone public.session_timezone())::date;
$$;

-- ---------- Limpieza del modelo viejo ----------
-- Primero funciones que referencian tablas que se van a soltar.
drop function if exists public.employee_profile();
drop function if exists public.my_open_attendance();
drop function if exists public.my_attendance(int, int);
drop function if exists public.record_check_in(uuid, double precision, double precision, double precision, text, boolean);
drop function if exists public.record_check_out(uuid, text, double precision, double precision, double precision);
drop table if exists public.attendance cascade;

-- Empleados: dejan de depender de `shifts`.
alter table public.employees drop column if exists shift_id;

-- Empleados: rol con enum y catálogos de empresa.
alter table public.employees drop constraint if exists employees_role_check;
alter table public.employees
  alter column role drop default,
  alter column role type public.employee_role using role::public.employee_role,
  alter column role set default 'employee'::public.employee_role;

alter table public.employees
  add column if not exists department_id uuid references public.departments(id),
  add column if not exists position_id uuid references public.positions(id);
create index if not exists employees_department_idx on public.employees (department_id);
create index if not exists employees_position_idx on public.employees (position_id);

drop table if exists public.shifts;

-- ---------- Asistencias: eventos dentro de una sesión ----------
-- Una sesión agrupa checadas del mismo "día laboral":
--   check_in -> break_out -> break_in -> check_out.
create table public.attendance (
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

create index attendance_session_idx on public.attendance (session_id);
create index attendance_employee_date_idx on public.attendance (employee_id, check_date desc, happened_at desc);
create index attendance_branch_idx on public.attendance (branch_id);

-- Idempotencia: un solo check_in por empleado y día laboral.
-- El `on conflict` de `record_check_in` usa este índice para
-- devolver la sesión existente en reintentos (dedupe por red/offline).
create unique index attendance_one_check_in_per_day_idx
  on public.attendance (employee_id, check_date, check_type)
  where check_type = 'check_in';

create unique index attendance_idempotency_key_idx
  on public.attendance (idempotency_key)
  where idempotency_key is not null;

-- ---------- Evidencia por evento ----------
-- Fotos/videos en Storage; aquí solo la referencia + firma.
create table public.attendance_evidence (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid not null references public.attendance(id) on delete cascade,
  kind text not null default 'photo' check (kind in ('photo', 'video', 'signature')),
  file_path text not null,
  sha256 text,
  mime_type text,
  size_bytes bigint,
  uploaded_at timestamptz not null default now()
);
create index attendance_evidence_attendance_idx on public.attendance_evidence (attendance_id);

-- ---------- Permisos / vacaciones / incapacidades ----------
-- Cada solicitud cubre un rango de fechas; `approval_status` controla
-- la aprobación. Las fechas cubiertas por una solicitud aprobada marcan
-- el día como "excused" (ver vista attendance_days).
create table public.offtime_requests (
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
create index offtime_employee_idx on public.offtime_requests (employee_id, starts_on);
create index offtime_status_idx on public.offtime_requests (status);

-- ---------- Incidencias ----------
-- Detección automática (retardo, fuera de radio, NIP erróneo, duplicados)
-- y manual (reporte de HR). Alimenta notificaciones a empleado.
create table public.incidents (
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
create index incidents_employee_idx on public.incidents (employee_id, created_at);
create index incidents_status_idx on public.incidents (status);

-- ---------- Vista de sesiones (compatible con la app móvil) ----------
-- Una fila por sesión; columnas `check_in/check_out/status/...` idénticas
-- al modelo viejo para no romper la app.
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

-- ---------- Vista de días laborales (reporte: falta/permiso/…) ----------
-- Para HR/admin: estatus del día considerando solicitudes aprobadas.
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