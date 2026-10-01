-- ============================================================
-- Checador 0010 — Fase 4: Panel de administración.
-- Campos nuevos para el panel (teléfono, fecha de alta, nombre),
-- prioridad de avisos, RBAC adicional, auditoría con flag de
-- "edición admin" y funciones RPC para el backend (service_role).
-- ============================================================

-- ---------- Empleados: campos del expediente administrativo ----------
alter table public.employees
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists phone text,
  add column if not exists hire_date date;

-- ---------- Avisos: prioridad para el panel ----------
alter table public.announcements
  add column if not exists priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'critical'));

-- Índice para la búsqueda por nombre/código del panel.
create index if not exists employees_full_name_idx on public.employees (full_name);

-- ---------- RBAC adicional (HR) ----------
-- HR gestiona asistencias (correcciones auditadas), avisos, media y
-- visualiza pantallas. `admin` ya tiene '*'; la rotación de tokens de
-- display queda como acción separada para HR/empleados.
insert into public.role_permissions (role, action) values
  ('hr', 'attendance.manage'),
  ('hr', 'announcements.read'),
  ('hr', 'media.read'),
  ('hr', 'displays.read'),
  ('hr', 'audit.read')
on conflict do nothing;

insert into public.role_permissions (role, action) values
  ('admin', 'displays.manage')
on conflict do nothing;

-- ============================================================
-- Auditoría admin: el trigger respeta `app.skip_attendance_audit`
-- (las correcciones vía RPC escriben su propia entrada con actor).
-- ============================================================
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

-- ============================================================
-- Escritura de auditoría con actor explícito (backend service_role).
-- No usa auth.uid(): el panel pasa req.user.id como actor.
-- ============================================================
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

-- ============================================================
-- Dashboard: resumen de un día laboral + serie de 7 días.
-- ============================================================
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

-- ============================================================
-- Búsqueda/paginado de asistencias (incluye "missing" de empleados
-- activos sin checar en el día). Motor del módulo Asistencia y de
-- los reportes por día.
-- ============================================================
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
      rows.*
    from combined rows
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

-- ============================================================
-- Detalle de sesión (cualquier empleado) + eventos + evidencias.
-- ============================================================
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

-- ============================================================
-- Corrección manual de un evento (modo "edición admin").
-- Cambia hora y/o estatus con motivo obligatorio; el trigger se
-- omite mediante `app.skip_attendance_audit` y aquí se escribe la
-- auditoría completa (antes/después + motivo + actor).
-- ============================================================
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

-- ============================================================
-- Solicitudes de permiso/vacaciones/incapacidad (HR/admin).
-- ============================================================
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

-- ============================================================
-- Incidencias (creación manual / resolución).
-- ============================================================
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

-- ============================================================
-- Displays: para dejar activar/desactivar pantallas con auditoría.
-- La rotación/revocación de tokens ya vive en 0009.
-- ============================================================
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

-- ============================================================
-- Security: las funciones del panel solo las ejecuta service_role
-- (el backend valida RBAC antes de llamarlas).
-- ============================================================
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