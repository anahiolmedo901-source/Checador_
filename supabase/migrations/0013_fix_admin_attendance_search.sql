-- FIX: módulo Asistencia (web admin) responde 500 con
--   "each UNION query must have the same number of columns"
-- Causa: la versión de public.admin_attendance_search en la BD quedó
--   desincronizada (CTEs present_rows/missing_rows con distinto nº de columnas).
-- Este script re-crea la función con la definición correcta (13 columnas en ambos CTEs).
-- Ejecutar en: Supabase Dashboard → SQL Editor (una sola vez).
-- Verifica después con: GET /api/admin/attendance?from=2026-09-27&to=2026-09-27

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
    coalesce(max(total), 0) into v_total
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
-- Mantener esta función accesible solo para el backend con service_role.
revoke all on function public.admin_attendance_search(date, date, uuid, uuid, uuid, text, text, int, int) from public, anon, authenticated;
grant execute on function public.admin_attendance_search(date, date, uuid, uuid, uuid, text, text, int, int) to service_role;
