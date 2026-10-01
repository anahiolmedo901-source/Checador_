-- Mantiene la fecha de sesión consistente con la entrada al corregir una
-- asistencia y evita que la edición rompa la secuencia de eventos.
do $$ begin
  alter table public.schedules add constraint schedules_time_order
    check (check_out > check_in) not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.employee_schedules add constraint employee_schedules_dates_order
    check (effective_to is null or effective_to >= effective_from) not valid;
exception when duplicate_object then null; end $$;

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
  v_new_session_date date;
  v_order int;
begin
  if p_happened_at is null and p_status is null then
    raise exception 'Debes indicar al menos una hora o un estatus nuevo.';
  end if;
  if p_status = 'excused' then
    raise exception 'El estatus justificado se resuelve con una solicitud aprobada.';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) < 3 then
    raise exception 'El motivo debe tener al menos 3 caracteres.';
  end if;
  if p_happened_at is not null and p_happened_at > now() then
    raise exception 'La hora corregida no puede estar en el futuro.';
  end if;

  select * into v_old from public.attendance where id = p_event_id for update;
  if v_old.id is null then
    raise exception 'El evento de asistencia no existe.';
  end if;

  v_order := case v_old.check_type
    when 'check_in' then 1 when 'break_out' then 2
    when 'break_in' then 3 when 'check_out' then 4 end;

  if p_happened_at is not null and exists (
    select 1 from public.attendance a
    where a.session_id = v_old.session_id and a.id <> v_old.id
      and ((case a.check_type when 'check_in' then 1 when 'break_out' then 2
             when 'break_in' then 3 when 'check_out' then 4 end) < v_order
           and a.happened_at >= p_happened_at
        or (case a.check_type when 'check_in' then 1 when 'break_out' then 2
             when 'break_in' then 3 when 'check_out' then 4 end) > v_order
           and a.happened_at <= p_happened_at)
  ) then
    raise exception 'La hora corregida debe conservar el orden de entrada, comida y salida.';
  end if;

  if v_old.check_type = 'check_in' and p_happened_at is not null then
    v_new_session_date := (p_happened_at at time zone public.session_timezone())::date;
    if exists (
      select 1 from public.attendance a
      where a.employee_id = v_old.employee_id and a.check_date = v_new_session_date
        and a.check_type = 'check_in' and a.session_id <> v_old.session_id
    ) then
      raise exception 'Ya existe otra entrada del empleado en esa fecha laboral.';
    end if;
  end if;

  perform set_config('app.skip_attendance_audit', 'on', true);
  update public.attendance
    set happened_at = coalesce(p_happened_at, happened_at),
        status = coalesce(p_status, status),
        note = btrim(p_motivo)
    where id = p_event_id
    returning * into v_new;

  if v_new_session_date is not null then
    update public.attendance
      set check_date = v_new_session_date
      where session_id = v_old.session_id and id <> v_old.id;
    update public.attendance set check_date = v_new_session_date where id = v_old.id;
  end if;
  perform set_config('app.skip_attendance_audit', 'off', true);
  select * into v_new from public.attendance where id = p_event_id;

  perform public.admin_write_audit(
    p_actor_id, 'MODIFIED', 'attendance', p_event_id,
    jsonb_build_object('happened_at', v_old.happened_at, 'check_date', v_old.check_date, 'status', v_old.status::text),
    jsonb_build_object('happened_at', v_new.happened_at, 'check_date', v_new.check_date, 'status', v_new.status::text),
    jsonb_build_object('session_id', v_old.session_id, 'employee_id', v_old.employee_id,
      'check_type', v_old.check_type::text, 'motivo', btrim(p_motivo))
  );
  return to_jsonb(v_new);
end;
$$;

revoke execute on function public.admin_edit_attendance(uuid, timestamptz, public.attendance_status, text, uuid) from anon, authenticated, public;
grant execute on function public.admin_edit_attendance(uuid, timestamptz, public.attendance_status, text, uuid) to service_role;
