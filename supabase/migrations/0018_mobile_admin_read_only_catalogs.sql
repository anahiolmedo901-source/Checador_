-- Lectura móvil de empleados y horarios, protegida por role_permissions.
-- No expone acceso directo a las tablas ni necesita SUPABASE_SERVICE_ROLE_KEY.

create or replace function public.mobile_admin_employee_list(
  p_search text default null,
  p_limit integer default 100
)
returns table (
  id uuid,
  code text,
  full_name text,
  role text,
  department_name text,
  active boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.employee_role;
  v_search text := left(trim(coalesce(p_search, '')), 100);
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 100));
begin
  select e.role into v_role
  from public.employees e
  where e.id = auth.uid() and e.active;

  if v_role is null then
    raise exception 'No tienes un perfil activo para consultar empleados.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.role_permissions rp
    where rp.role = v_role and rp.action in ('*', 'employees.read')
  ) then
    raise exception 'No tienes permiso para consultar empleados.' using errcode = '42501';
  end if;

  return query
  select e.id, e.code, e.full_name, e.role::text, d.name, e.active
  from public.employees e
  left join public.departments d on d.id = e.department_id
  where e.active
    and (
      v_search = ''
      or e.full_name ilike '%' || v_search || '%'
      or e.code ilike '%' || v_search || '%'
    )
  order by e.full_name
  limit v_limit;
end;
$$;

create or replace function public.mobile_admin_schedule_list()
returns table (
  id uuid,
  name text,
  code text,
  check_in time,
  check_out time,
  tolerance_min integer,
  break_min integer,
  active boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.employee_role;
begin
  select e.role into v_role
  from public.employees e
  where e.id = auth.uid() and e.active;

  if v_role is null then
    raise exception 'No tienes un perfil activo para consultar horarios.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.role_permissions rp
    where rp.role = v_role and rp.action in ('*', 'schedules.read')
  ) then
    raise exception 'No tienes permiso para consultar horarios.' using errcode = '42501';
  end if;

  return query
  select s.id, s.name, s.code, s.check_in, s.check_out,
         s.tolerance_min, s.break_min, s.active
  from public.schedules s
  order by s.active desc, s.check_in, s.name;
end;
$$;

revoke all on function public.mobile_admin_employee_list(text, integer) from public, anon;
revoke all on function public.mobile_admin_schedule_list() from public, anon;
grant execute on function public.mobile_admin_employee_list(text, integer) to authenticated;
grant execute on function public.mobile_admin_schedule_list() to authenticated;
