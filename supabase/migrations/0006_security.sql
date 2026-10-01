-- ============================================================
-- Checador 0006 — Seguridad: RLS, auditoría y permisos.
-- Regla: datas sensibles (asistencias, evidencias, solicitudes,
-- incidencias, dispositivos) SOLO se tocan vía funciones security
-- definer o con la service_role del backend (fases 2+).
-- ============================================================

-- ---------- Auditoría ----------
create table public.audit_logs (
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
create index audit_logs_entity_idx on public.audit_logs (entity, created_at);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at);

-- Solo se invoca desde funciones security definer / trigger (sin grants).
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

-- Trigger de auditoría sobre asistencias.
create or replace function public.audit_attendance_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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

-- ---------- RLS: habilitar y bloquear acceso directo ----------
-- (sin políticas => DENEGAR por defecto; solo se entra por funciones
-- security definer o service_role del backend).

do $$
declare t text;
begin
  foreach t in array array[
    'attendance', 'attendance_evidence',
    'offtime_requests', 'incidents', 'audit_logs', 'app_settings',
    'departments', 'positions', 'schedules', 'employee_schedules',
    'devices', 'displays', 'display_playlists', 'media',
    'role_permissions', 'branches', 'employees'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);
  end loop;
end $$;

-- Las vistas se protegen también (RLS en vistas requiere PG 15+;
-- los tipos de fila siguen siendo accesibles vía funciones definer).
-- Las vistas se protegen también vía security_invoker (RLS del llamante
-- aplica sobre las tablas base en PG15+; ENABLE RLS no aplica a vistas).
alter view public.attendance_sessions set (security_invoker = true);
alter view public.attendance_days set (security_invoker = true);

-- ---------- Políticas de lectura no sensibles ----------

-- Catálogo RBAC legible por cualquier usuario autenticado (para UI).
create policy "read role_permissions"
  on public.role_permissions for select to authenticated
  using (true);

-- Avisos visibles si están activos y dirigidos al rol del empleado.
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

-- Multimedia activa legible (para avisos/display).
create policy "read active media"
  on public.media for select to authenticated
  using (active = true);

-- Notificaciones: cada usuario solo ve y marca las suyas.
create policy "read own notifications"
  on public.notifications for select to authenticated
  using (user_id = auth.uid());

create policy "update own notifications"
  on public.notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------- Grants / revokes ----------
-- Revocar el EXECUTE por defecto (PÚBLICO) y dejarlo solo para
-- roles que lo necesitan.

-- Funciones de empleado: solo authenticated.
revoke execute on function public.employee_profile() from anon, public;
revoke execute on function public.my_open_attendance() from anon, public;
revoke execute on function public.my_attendance(int, int) from anon, public;
revoke execute on function public.record_check_in(uuid, double precision, double precision, double precision, text, boolean) from anon, public;
revoke execute on function public.record_check_out(uuid, text, double precision, double precision, double precision) from anon, public;
revoke execute on function public.record_break_out(uuid, double precision, double precision, double precision) from anon, public;
revoke execute on function public.record_break_in(uuid, double precision, double precision, double precision) from anon, public;
revoke execute on function public.my_off_requests() from anon, public;
revoke execute on function public.request_off(public.off_type, date, date, text) from anon, public;
revoke execute on function public.approve_off(uuid, boolean, text) from anon, public;
revoke execute on function public.session_timezone() from anon, public;
revoke execute on function public.session_check_date() from anon, public;
revoke execute on function public.current_schedule_for(uuid) from anon, public;
revoke execute on function public.write_audit_log(text, text, uuid, jsonb, jsonb, jsonb) from anon, public, authenticated;
revoke execute on function public.audit_attendance_change() from anon, public, authenticated;

grant execute on function public.employee_profile() to authenticated;
grant execute on function public.my_open_attendance() to authenticated;
grant execute on function public.my_attendance(int, int) to authenticated;
grant execute on function public.record_check_in(uuid, double precision, double precision, double precision, text, boolean) to authenticated;
grant execute on function public.record_check_out(uuid, text, double precision, double precision, double precision) to authenticated;
grant execute on function public.record_break_out(uuid, double precision, double precision, double precision) to authenticated;
grant execute on function public.record_break_in(uuid, double precision, double precision, double precision) to authenticated;
grant execute on function public.my_off_requests() to authenticated;
grant execute on function public.request_off(public.off_type, date, date, text) to authenticated;
grant execute on function public.approve_off(uuid, boolean, text) to authenticated;

-- employee_profile() sigue siendo llamable por anon según la migración
-- original (usado en flujos de pre-login); se re-garantiza para autenticados.
grant execute on function public.session_timezone() to authenticated;

-- Select a catálogos de UI.
grant select on public.role_permissions to authenticated;
grant select on public.announcements to authenticated;
grant select on public.media to authenticated;
grant select on public.notifications to authenticated;

-- Backend (fases 2+) usará la service_role; no hay grants explícitos
-- adicionales para roles de cliente.