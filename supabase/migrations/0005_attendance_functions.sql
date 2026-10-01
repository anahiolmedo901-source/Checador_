-- ============================================================
-- Checador 0005 — Funciones (RPC) sobre el modelo por sesiones.
-- Todas security definer: la app móvil NO toca tablas directamente.
-- Firmas compatibles con la app móvil existente:
--   employee_profile(), my_open_attendance(), my_attendance(int,int),
--   record_check_in(uuid, ...), record_check_out(uuid, ...).
-- ============================================================

-- Horario vigente de un empleado (employee_schedules → schedules).
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

-- ---------- Historial del empleado ----------
create or replace function public.my_attendance(p_limit int default 30, p_offset int default 0)
returns setof public.attendance_sessions
language sql
security definer
set search_path = public
as $$
  select s.*
  from public.attendance_sessions s
  where s.employee_id = auth.uid()
  order by s.check_in desc
  limit p_limit offset p_offset;
$$;

-- ---------- Registro de entrada ----------
create or replace function public.record_check_in(
  p_branch_id uuid,
  p_lat double precision default null,
  p_lon double precision default null,
  p_accuracy_m double precision default null,
  p_photo_path text default null,
  p_skip_location boolean default false
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
  v_status public.attendance_status := 'on_time';
  v_start_limit time;
  v_distance double precision;
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

  -- Idempotencia: si ya checó entrada hoy, devolver la sesión existente
  -- (reintentos por red u offline no crean duplicados).
  select s.* into v_result
  from public.attendance_sessions s
  where s.employee_id = v_employee.id
    and s.check_date = public.session_check_date();
  if found then
    return v_result;
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

  -- Estatus: sin horario vigente -> fuera de ventana;
  -- después del límite (hora inicio + tolerancia) -> retardo.
  v_schedule := public.current_schedule_for(v_employee.id);
  if v_schedule.id is null then
    v_status := 'out_of_window';
  else
    v_start_limit := v_schedule.check_in + make_interval(mins => v_schedule.tolerance_min);
    if (v_now at time zone public.session_timezone())::time > v_start_limit then
      v_status := 'late';
    end if;
  end if;

  with ins as (
    insert into public.attendance(
      session_id, employee_id, branch_id, device_id, check_type, check_date,
      happened_at, status, lat, lon, accuracy_m, photo_url, source, idempotency_key
    )
    values (
      v_session_id, v_employee.id, v_branch.id, null, 'check_in', public.session_check_date(),
      v_now, v_status, p_lat, p_lon, p_accuracy_m, p_photo_path, 'mobile', v_session_id
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

-- ---------- Registro de salida ----------
create or replace function public.record_check_out(
  p_attendance_id uuid,
  p_photo_path text default null,
  p_lat double precision default null,
  p_lon double precision default null,
  p_accuracy_m double precision default null
)
returns public.attendance_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_result public.attendance_sessions;
begin
  if not exists (
    select 1 from public.attendance a
    where a.session_id = p_attendance_id and a.employee_id = auth.uid()
  ) then
    raise exception 'La checada no existe o no te pertenece.';
  end if;

  if exists (
    select 1 from public.attendance a
    where a.session_id = p_attendance_id and a.check_type = 'check_out'
  ) then
    raise exception 'Ya registraste tu salida.';
  end if;

  insert into public.attendance(
    session_id, employee_id, branch_id, device_id, check_type, check_date,
    happened_at, status, lat, lon, accuracy_m, photo_url, source, idempotency_key
  )
  select
    ci.session_id, ci.employee_id, ci.branch_id, ci.device_id, 'check_out', ci.check_date,
    now(), 'on_time', p_lat, p_lon, p_accuracy_m, p_photo_path, 'mobile', gen_random_uuid()
  from public.attendance ci
  where ci.session_id = p_attendance_id and ci.check_type = 'check_in'
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

-- ---------- Pausas (break) ----------
create or replace function public.record_break_out(
  p_attendance_id uuid,
  p_lat double precision default null,
  p_lon double precision default null,
  p_accuracy_m double precision default null
)
returns public.attendance_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.attendance_sessions;
  v_active_break boolean;
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
  ) into v_active_break;
  if v_active_break then
    raise exception 'Ya tienes una pausa en curso.';
  end if;

  insert into public.attendance(
    session_id, employee_id, branch_id, check_type, check_date,
    happened_at, status, lat, lon, accuracy_m, source, idempotency_key
  )
  select
    ci.session_id, ci.employee_id, ci.branch_id, 'break_out', ci.check_date,
    now(), 'on_time', p_lat, p_lon, p_accuracy_m, 'mobile', gen_random_uuid()
  from public.attendance ci
  where ci.session_id = p_attendance_id and ci.check_type = 'check_in';

  select s.* into v_result from public.attendance_sessions s where s.id = p_attendance_id;
  return v_result;
end;
$$;

create or replace function public.record_break_in(
  p_attendance_id uuid,
  p_lat double precision default null,
  p_lon double precision default null,
  p_accuracy_m double precision default null
)
returns public.attendance_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.attendance_sessions;
begin
  if not exists (
    select 1 from public.attendance a
    where a.session_id = p_attendance_id and a.employee_id = auth.uid() and a.check_type = 'check_in'
  ) then
    raise exception 'La checada no existe o no te pertenece.';
  end if;

  if not exists (
    select 1 from public.attendance a
    where a.session_id = p_attendance_id and a.check_type = 'break_out'
      and not exists (
        select 1 from public.attendance b
        where b.session_id = a.session_id and b.check_type = 'break_in'
          and b.happened_at > a.happened_at
      )
  ) then
    raise exception 'No tienes una pausa en curso.';
  end if;

  insert into public.attendance(
    session_id, employee_id, branch_id, check_type, check_date,
    happened_at, status, lat, lon, accuracy_m, source, idempotency_key
  )
  select
    ci.session_id, ci.employee_id, ci.branch_id, 'break_in', ci.check_date,
    now(), 'on_time', p_lat, p_lon, p_accuracy_m, 'mobile', gen_random_uuid()
  from public.attendance ci
  where ci.session_id = p_attendance_id and ci.check_type = 'check_in';

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