-- ============================================================
-- Checador — Esquema base
-- Sistema de control de asistencia
-- ============================================================

create extension if not exists "pgcrypto";

-- Sucursales con geocerca
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  lat double precision not null,
  lon double precision not null,
  radius_m numeric not null default 300,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Turnos con horario fijo y tolerancia
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_time time not null,
  end_time time not null,
  tolerance_min int not null default 5,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Empleados. id = auth.users.id (auth.uid())
create table public.employees (
  id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique,
  full_name text not null,
  photo_url text,
  branch_id uuid references public.branches(id),
  shift_id uuid references public.shifts(id),
  role text not null default 'employee' check (role in ('employee', 'admin')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index employees_branch_id_idx on public.employees (branch_id);
create index employees_shift_id_idx on public.employees (shift_id);

-- Asistencias (entrada/salida por día)
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  check_in timestamptz not null,
  check_out timestamptz,
  status text not null default 'on_time' check (status in ('on_time', 'late')),
  photo_url text,
  photo_out_url text,
  lat double precision,
  lon double precision,
  accuracy_m double precision,
  lat_out double precision,
  lon_out double precision,
  accuracy_out_m double precision,
  created_at timestamptz not null default now(),
  constraint attendance_check_out_after_in check (check_out is null or check_out > check_in)
);
create index attendance_employee_date_idx on public.attendance (employee_id, check_in desc);
create index attendance_branch_idx on public.attendance (branch_id);

-- ============================================================
-- RLS: acceso directo a tablas restringido.
-- Todas las operaciones de la app móvil pasan por functions
-- security definer (abajo). El panel admin ampliará políticas.
-- ============================================================
alter table public.branches enable row level security;
alter table public.shifts enable row level security;
alter table public.employees enable row level security;
alter table public.attendance enable row level security;

-- ============================================================
-- Funciones (security definer)
-- ============================================================

-- Perfil del empleado autenticado, con sucursal y turno.
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
      'start_time', to_char(s.start_time, 'HH24:MI'),
      'end_time', to_char(s.end_time, 'HH24:MI'),
      'tolerance_min', s.tolerance_min
    ) end)
  )
  from public.employees e
  left join public.branches b on b.id = e.branch_id
  left join public.shifts s on s.id = e.shift_id
  where e.id = auth.uid();
$$;

-- Checada actual abierta del empleado (entry sin salida).
create or replace function public.my_open_attendance()
returns setof public.attendance
language sql
security definer
set search_path = public
as $$
  select a.*
  from public.attendance a
  where a.employee_id = auth.uid()
    and a.check_out is null
  order by a.check_in desc
  limit 1;
$$;

-- Historial del empleado.
create or replace function public.my_attendance(p_limit int default 30, p_offset int default 0)
returns setof public.attendance
language sql
security definer
set search_path = public
as $$
  select a.*
  from public.attendance a
  where a.employee_id = auth.uid()
  order by a.check_in desc
  limit p_limit offset p_offset;
$$;

-- Registra la entrada. Valida estado, sucursal activa y geocerca
-- (la distancia se re-comprueba en el servidor, el cliente no puede mentir).
create or replace function public.record_check_in(
  p_branch_id uuid,
  p_lat double precision default null,
  p_lon double precision default null,
  p_accuracy_m double precision default null,
  p_photo_path text default null,
  p_skip_location boolean default false
)
returns public.attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee public.employees;
  v_branch public.branches;
  v_shift public.shifts;
  v_open public.attendance;
  v_now timestamptz := now();
  v_status text := 'on_time';
  v_start_limit timetz;
  v_distance double precision;
begin
  select * into v_employee from public.employees where id = auth.uid();
  if not found then
    raise exception 'No tienes un perfil de empleado válido.';
  end if;
  if not v_employee.active then
    raise exception 'Tu cuenta está inactiva. Contacta al administrador.';
  end if;

  select * into v_open from public.attendance
    where employee_id = v_employee.id and check_out is null
    order by check_in desc
    limit 1;
  if found then
    raise exception 'Ya tienes una entrada abierta. Registra tu salida primero.';
  end if;

  select * into v_branch from public.branches where id = p_branch_id;
  if not found then
    raise exception 'La sucursal no existe.';
  end if;
  if not v_branch.active then
    raise exception 'La sucursal está inactiva. Contacta al administrador.';
  end if;

  if not coalesce(p_skip_location, false) then
    if p_lat is null or p_lon is null then
      raise exception 'No fue posible obtener tu ubicación.';
    end if;
    select 6371000 * 2 * asin(sqrt(
      power(sin(radians((p_lat - v_branch.lat) / 2)), 2) +
      cos(radians(v_branch.lat)) * cos(radians(p_lat)) *
      power(sin(radians((p_lon - v_branch.lon) / 2)), 2)
    )) into v_distance;
    if v_distance > (v_branch.radius_m + coalesce(p_accuracy_m, 0)) then
      raise exception
        'Te encuentras a %s m. La sucursal permite un radio de %s m.',
        round(v_distance)::text,
        round((v_branch.radius_m + coalesce(p_accuracy_m, 0)))::text;
    end if;
  end if;

  select * into v_shift from public.shifts where id = v_employee.shift_id and active;
  if found then
    v_start_limit := v_shift.start_time + make_interval(mins => v_shift.tolerance_min);
    if localtime > v_start_limit then
      v_status := 'late';
    end if;
  end if;

  insert into public.attendance(
    employee_id, branch_id, check_in, status, photo_url,
    lat, lon, accuracy_m
  )
  values (
    v_employee.id, v_branch.id, v_now, v_status, p_photo_path,
    p_lat, p_lon, p_accuracy_m
  )
  returning * into v_open;

  return v_open;
end;
$$;

-- Registra la salida de una entrada abierta.
create or replace function public.record_check_out(
  p_attendance_id uuid,
  p_photo_path text default null,
  p_lat double precision default null,
  p_lon double precision default null,
  p_accuracy_m double precision default null
)
returns public.attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee public.employees;
  v_att public.attendance;
begin
  select * into v_employee from public.employees where id = auth.uid();
  if not found then
    raise exception 'No tienes un perfil de empleado válido.';
  end if;

  select * into v_att from public.attendance
    where id = p_attendance_id and employee_id = v_employee.id;
  if not found then
    raise exception 'La checada no existe o no te pertenece.';
  end if;
  if v_att.check_out is not null then
    raise exception 'Ya registraste tu salida.';
  end if;

  update public.attendance
    set check_out = now(),
        photo_out_url = p_photo_path,
        lat_out = p_lat,
        lon_out = p_lon,
        accuracy_out_m = p_accuracy_m
  where id = v_att.id
  returning * into v_att;

  return v_att;
end;
$$;

grant execute on function public.employee_profile() to authenticated;
grant execute on function public.employee_profile() to anon;
grant execute on function public.my_open_attendance() to authenticated;
grant execute on function public.my_attendance(int, int) to authenticated;
grant execute on function public.record_check_in(uuid, double precision, double precision, double precision, text, boolean) to authenticated;
grant execute on function public.record_check_out(uuid, text, double precision, double precision, double precision) to authenticated;