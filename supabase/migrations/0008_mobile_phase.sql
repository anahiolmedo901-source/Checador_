-- ============================================================
-- Checador 0008 — Fase 2: app móvil del empleado.
-- Registro/autorización de dispositivos, idempotencia por UUID
-- de operación, estado de sesión desde el servidor y lectura de
-- evidencia propia (URLs firmadas).
-- ============================================================

-- ---------- Autorización de dispositivos ----------
-- El primer dispositivo de un empleado se autoriza automáticamente
-- (no existe panel de HR en FASE 2); los registros adicionales
-- quedan "pending" hasta que HR/Administración los apruebe (fase 3).
create type public.device_authorization as enum ('authorized', 'pending', 'denied');

alter table public.devices
  add column if not exists "authorization" public.device_authorization not null default 'pending',
  add column if not exists os_version text,
  add column if not exists app_version text;

-- ---------- Registro (upsert) del dispositivo del empleado ----------
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
  v_prior_count int;
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
    -- Si pertenecía a otra persona, pasa a revisión otra vez.
    if v_device.employee_id is distinct from v_employee.id then
      v_auth := 'pending';
    else
      v_auth := v_device.authorization;
    end if;
    update public.devices
      set employee_id = v_employee.id,
          platform = p_platform,
          model = coalesce(p_model, model),
          manufacturer = coalesce(p_manufacturer, manufacturer),
          os_version = coalesce(p_os_version, os_version),
          app_version = coalesce(p_app_version, app_version),
          "authorization" = v_auth,
          last_seen_at = now(),
          is_active = true
      where id = v_device.id
      returning * into v_device;
    return jsonb_build_object(
      'id', v_device.id,
      'authorization', v_device.authorization,
      'is_active', v_device.is_active,
      'employee_id', v_device.employee_id
    );
  end if;

  select count(*) into v_prior_count from public.devices where employee_id = v_employee.id;
  v_auth := case
    when v_prior_count = 0 then 'authorized'::public.device_authorization
    else 'pending'::public.device_authorization
  end;

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

-- Valida que el dispositivo mencionado en una checada es del empleado
-- y está autorizado. Se invoca SOLO desde dentro de otras funciones
-- security definer (sin grants para clientes).
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
  if v_device.authorization = 'pending' then
    raise exception 'Tu dispositivo está pendiente de autorización. Inténtalo más tarde.';
  end if;
  if v_device.authorization = 'denied' then
    raise exception 'Tu dispositivo no está autorizado. Contacta al administrador.';
  end if;
  update public.devices set last_seen_at = now() where id = p_device_id;
end;
$$;

-- ---------- Estado de la sesión del empleado (fuente de verdad) ----------
-- Valida la geocerca para cualquier checada con coordenadas (fuente de
-- verdad del servidor: el cliente no puede declarar "estoy dentro").
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

create or replace function public.my_session_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.attendance_sessions;
  v_break_open boolean;
  v_next text;
  v_device jsonb;
begin
  select s.* into v_session
  from public.attendance_sessions s
  where s.employee_id = auth.uid() and s.is_open
  order by s.check_in desc
  limit 1;

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
    'device', v_device
  );
end;
$$;

-- ---------- Historial con sucursal (para la app) ----------
-- No toca `attendance_sessions` (compartida con otras funciones);
-- crea una vista de lista + branch para consumo de FASE 2.
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

alter view public.attendance_list set (security_invoker = true);

-- Historial: cambia el tipo de retorno para incluir la sucursal.
drop function if exists public.my_attendance(int, int);
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

-- ============================================================
-- Checadas: agregan dispositivo + UUID de operación (idempotencia)
-- y evidencia opcional en pausas. Firmas nuevas => las funciones
-- antiguas se reemplazan y se re-garantizan abajo.
-- ============================================================

-- ---------- Registro de entrada ----------
drop function if exists public.record_check_in(uuid, double precision, double precision, double precision, text, boolean);
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

  -- Geocerca de sucursal: siempre obligatoria, con precisión acotada por
  -- el servidor (`assert_geo_ok`). El cliente no puede desactivarla ni
  -- inflar la precisión para ampliar el radio.
  perform public.assert_geo_ok(v_branch.id, p_lat, p_lon, p_accuracy_m);

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

-- ---------- Registro de salida ----------
drop function if exists public.record_check_out(uuid, text, double precision, double precision, double precision);
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
drop function if exists public.record_break_out(uuid, double precision, double precision, double precision);
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
drop function if exists public.record_break_in(uuid, double precision, double precision, double precision);
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

-- ============================================================
-- Storage: el empleado puede leer SOLO su carpeta de evidencias
-- (necesario para generar URLs firmadas con su propio JWT).
-- ============================================================
drop policy if exists "read own evidence" on storage.objects;
create policy "read own evidence"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'attendance-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- Grants (defensivos: solo los roles correctos).
-- ============================================================
revoke execute on function public.register_device(text, text, text, text, text, text) from anon, public;
revoke execute on function public.my_session_state() from anon, public;
revoke execute on function public.attendance_detail(uuid) from anon, public;
revoke execute on function public.my_attendance(int, int) from anon, public;
revoke execute on function public.record_check_in(uuid, double precision, double precision, double precision, text, uuid, uuid) from anon, public;
revoke execute on function public.record_check_out(uuid, text, double precision, double precision, double precision, uuid, uuid) from anon, public;
revoke execute on function public.record_break_out(uuid, text, double precision, double precision, double precision, uuid, uuid) from anon, public;
revoke execute on function public.record_break_in(uuid, text, double precision, double precision, double precision, uuid, uuid) from anon, public;
revoke execute on function public.assert_device_usable(uuid) from anon, public, authenticated;
revoke execute on function public.assert_geo_ok(uuid, double precision, double precision, double precision) from anon, public, authenticated;

grant execute on function public.register_device(text, text, text, text, text, text) to authenticated;
grant execute on function public.my_session_state() to authenticated;
grant execute on function public.attendance_detail(uuid) to authenticated;
grant execute on function public.my_attendance(int, int) to authenticated;
grant execute on function public.record_check_in(uuid, double precision, double precision, double precision, text, uuid, uuid) to authenticated;
grant execute on function public.record_check_out(uuid, text, double precision, double precision, double precision, uuid, uuid) to authenticated;
grant execute on function public.record_break_out(uuid, text, double precision, double precision, double precision, uuid, uuid) to authenticated;
grant execute on function public.record_break_in(uuid, text, double precision, double precision, double precision, uuid, uuid) to authenticated;