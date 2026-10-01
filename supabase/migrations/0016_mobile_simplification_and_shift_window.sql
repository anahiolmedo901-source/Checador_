-- Simplifica el registro de dispositivos y obliga a registrar la entrada
-- dentro del horario asignado, validado con la hora del servidor.

-- Los dispositivos que estaban en espera o rechazados quedan habilitados
-- bajo el nuevo flujo sin aprobaciones.
update public.devices
set "authorization" = 'authorized', is_active = true
where "authorization" in ('pending', 'denied');

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

-- Todo dispositivo nuevo se habilita automáticamente. La desactivación
-- explícita del administrador se conserva como bloqueo de seguridad.
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
    update public.devices
      set employee_id = v_employee.id,
          platform = p_platform,
          model = coalesce(p_model, model),
          manufacturer = coalesce(p_manufacturer, manufacturer),
          os_version = coalesce(p_os_version, os_version),
          app_version = coalesce(p_app_version, app_version),
          "authorization" = 'authorized',
          last_seen_at = now()
      where id = v_device.id
      returning * into v_device;
  else
    insert into public.devices(
      employee_id, device_identifier, platform, model, manufacturer,
      os_version, app_version, "authorization", last_seen_at, is_active
    )
    values (
      v_employee.id, p_device_identifier, p_platform, p_model, p_manufacturer,
      p_os_version, p_app_version, 'authorized', now(), true
    )
    returning * into v_device;
  end if;

  return jsonb_build_object(
    'id', v_device.id,
    'authorization', v_device.authorization,
    'is_active', v_device.is_active,
    'employee_id', v_device.employee_id
  );
end;
$$;

-- Autorización ya no bloquea al empleado. Se conserva la posibilidad de
-- desactivar un dispositivo desde administración.
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
    raise exception 'Este dispositivo está desactivado. Contacta al administrador.';
  end if;
  update public.devices set last_seen_at = now() where id = p_device_id;
end;
$$;

-- Expone la ventana de entrada para que la app muestre el horario correcto.
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

-- No se permiten entradas antes del inicio ni después del cierre del turno.
-- Las entradas fuera de la tolerancia siguen registrándose como retardo,
-- siempre que ocurran antes del fin del horario.
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

  perform public.assert_geo_ok(v_branch.id, p_lat, p_lon, p_accuracy_m);

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
