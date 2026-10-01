-- ============================================================
-- Checador 0009 — Fase 3: Smart Display / TV (Roku).
-- Identificación propia del display (Display ID + token hash,
-- revocable), dashboard agregado por sucursal, avisos y playlist
-- multimedia, y publicación Realtime para flujo push.
-- ============================================================

-- ---------- Tokens de display (revocables) ----------
-- El token en claro se muestra UNA vez al crearlo (admin/CLI);
-- en la BD solo vive su hash. Revocar un token deja la pantalla
-- sin autenticación hasta que se rote uno nuevo.
create table if not exists public.display_tokens (
  id uuid primary key default gen_random_uuid(),
  display_id uuid not null references public.displays(id) on delete cascade,
  token_hash text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_by uuid references public.employees(id) on delete set null
);
create index if not exists display_tokens_display_idx on public.display_tokens (display_id);

alter table public.displays
  add column if not exists software text,
  add column if not exists os_version text;

-- ---------- Hash determinístico token+display ----------
create or replace function public.display_hash_token(p_display_id uuid, p_token text)
returns text
language sql
immutable
security definer
set search_path = public
as $$
  select encode(
    extensions.digest(convert_to(p_display_id::text || ':' || coalesce(p_token, ''), 'UTF8'), 'sha256'),
    'hex'
  );
$$;

-- Verifica que el llamante es admin/hr (o service role con auth.uid() null).
create or replace function public.assert_display_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    if not exists (
      select 1 from public.employees e
      where e.id = auth.uid() and e.role in ('admin', 'hr')
    ) then
      raise exception 'No tienes permisos para administrar pantallas.';
    end if;
  end if;
end;
$$;

-- ---------- Rotar token (admin): invalida activos y entrega uno nuevo ----------
create or replace function public.display_token_rotate(p_display_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw text := encode(extensions.gen_random_bytes(24), 'hex');
  v_token_id uuid;
begin
  perform public.assert_display_admin();

  if not exists (select 1 from public.displays where id = p_display_id) then
    raise exception 'La pantalla no existe.';
  end if;

  update public.display_tokens
    set active = false, revoked_at = now()
    where display_id = p_display_id and active;

  insert into public.display_tokens (display_id, token_hash, created_by)
  values (p_display_id, public.display_hash_token(p_display_id, v_raw), auth.uid())
  returning id into v_token_id;

  return jsonb_build_object(
    'token', v_raw,
    'display_id', p_display_id,
    'token_id', v_token_id
  );
end;
$$;

-- ---------- Revocar token específico (admin) ----------
create or replace function public.display_token_revoke(p_token_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_display_admin();
  update public.display_tokens
    set active = false, revoked_at = now()
    where id = p_token_id and active;
end;
$$;

-- ---------- Revocar TODOS los tokens de una pantalla (admin) ----------
create or replace function public.display_token_revoke_all(p_display_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_display_admin();
  update public.display_tokens
    set active = false, revoked_at = now()
    where display_id = p_display_id and active;
end;
$$;

-- ---------- Autenticación de la TV (backend/CLI, service_role) ----------
-- Devuelve ok/reason + datos de la pantalla para el registro. Nunca
-- devuelve el token en claro ni hashes de otros displays.
create or replace function public.display_authenticate(p_code text, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display public.displays;
  v_token public.display_tokens;
begin
  select d.* into v_display
  from public.displays d
  where d.code = upper(trim(coalesce(p_code, '')));
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'display_not_found');
  end if;

  if not v_display.is_active then
    return jsonb_build_object('ok', false, 'reason', 'display_inactive');
  end if;

  select t.* into v_token
  from public.display_tokens t
  where t.display_id = v_display.id
    and t.token_hash = public.display_hash_token(v_display.id, p_token)
  order by t.created_at desc
  limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'token_invalid');
  end if;
  if not v_token.active then
    return jsonb_build_object('ok', false, 'reason', 'token_revoked');
  end if;

  update public.display_tokens set last_used_at = now() where id = v_token.id;

  return jsonb_build_object(
    'ok', true,
    'display', jsonb_build_object(
      'id', v_display.id,
      'name', v_display.name,
      'code', v_display.code,
      'status', v_display.status,
      'is_active', v_display.is_active,
      'branch_id', v_display.branch_id,
      'settings', v_display.settings
    ),
    'token_id', v_token.id
  );
end;
$$;

-- ---------- Heartbeat del display (backend) ----------
create or replace function public.display_heartbeat(p_display_id uuid, p_online boolean, p_software text default null, p_os_version text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.displays
    set last_seen_at = now(),
        status = case when p_online then 'online' else 'offline' end,
        software = coalesce(p_software, software),
        os_version = coalesce(p_os_version, os_version)
    where id = p_display_id;
end;
$$;

-- ============================================================
-- Snapshot del tablero (agregados por sucursal del display).
-- Privacidad: NO se exponen evidencias, ubicación ni datos
-- sensibles; solo conteos, nombres, hora, tipo, avisos y media.
-- ============================================================
create or replace function public.display_snapshot(p_display_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display public.displays;
  v_today date := public.session_check_date();
  v_total int;
  v_present int;
  v_late int;
  v_excused int;
  v_missing int;
  v_last_checks jsonb;
  v_announcements jsonb;
  v_playlist jsonb;
begin
  select d.* into v_display from public.displays d where d.id = p_display_id;
  if not found then
    raise exception 'La pantalla no existe.';
  end if;

  select count(*) into v_total
  from public.employees e
  where e.branch_id = v_display.branch_id and e.active;

  select count(distinct a.employee_id) into v_present
  from public.attendance a
  where a.branch_id = v_display.branch_id
    and a.check_type = 'check_in'
    and a.check_date = v_today;

  select count(distinct a.session_id) into v_late
  from public.attendance a
  where a.branch_id = v_display.branch_id
    and a.check_type = 'check_in'
    and a.check_date = v_today
    and a.status = 'late';

  select count(*) into v_excused
  from public.offtime_requests o
  join public.employees e on e.id = o.employee_id
  where e.branch_id = v_display.branch_id
    and e.active
    and o.status = 'approved'
    and v_today between o.starts_on and o.ends_on;

  v_missing := greatest(v_total - v_present - v_excused, 0);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id,
    'name', x.name,
    'check_type', x.check_type,
    'label', x.label,
    'time', x.time,
    'full_time', x.full_time,
    'status', x.status
  ) order by x.happened_at desc), '[]'::jsonb) into v_last_checks
  from (
    select
      a.id,
      e.full_name as name,
      a.check_type::text as check_type,
      case a.check_type
        when 'check_in' then 'ENTRADA'
        when 'check_out' then 'SALIDA'
        when 'break_out' then 'SALIDA COMIDA'
        when 'break_in' then 'REGRESO COMIDA'
      end as label,
      to_char((a.happened_at at time zone public.session_timezone()), 'HH24:MI') as time,
      to_char((a.happened_at at time zone public.session_timezone()), 'HH24:MI:SS') as full_time,
      a.status::text as status,
      a.happened_at
    from public.attendance a
    join public.employees e on e.id = a.employee_id
    where a.branch_id = v_display.branch_id
      and a.check_date = v_today
    order by a.happened_at desc
    limit 8
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', an.id,
    'title', an.title,
    'body', an.body
  ) order by an.published_at desc), '[]'::jsonb) into v_announcements
  from public.announcements an
  where an.active
    and an.published_at <= now()
    and (an.expires_at is null or an.expires_at > now())
    and an.audience_role @> array['employee'::public.employee_role];

  select coalesce(jsonb_agg(jsonb_build_object(
    'position', p.position,
    'item_type', p.item_type,
    'item_id', p.item_id,
    'duration_s', p.duration_s,
    'announcement', p.announcement,
    'media', p.media
  ) order by p.position), '[]'::jsonb) into v_playlist
  from (
    select
      pl.position,
      pl.item_type,
      pl.item_id,
      pl.duration_s,
      case when pl.item_type = 'announcement' then (
        select jsonb_build_object('id', an.id, 'title', an.title, 'body', an.body)
        from public.announcements an
        where an.id = pl.item_id and an.active
      ) else null end as announcement,
      case when pl.item_type = 'media' then (
        select jsonb_build_object(
          'id', md.id,
          'kind', md.kind::text,
          'title', md.title,
          'file_path', md.file_path,
          'url', md.url,
          'mime_type', md.mime_type,
          'duration_s', md.duration_s
        )
        from public.media md
        where md.id = pl.item_id and md.active
      ) else null end as media
    from public.display_playlists pl
    where pl.display_id = v_display.id and pl.active
  ) p
  where p.announcement is not null or p.media is not null;

  return jsonb_build_object(
    'display_id', v_display.id,
    'generated_at', now(),
    'branch', jsonb_build_object(
      'id', v_display.branch_id,
      'name', (select b.name from public.branches b where b.id = v_display.branch_id),
      'address', (select b.address from public.branches b where b.id = v_display.branch_id)
    ),
    'counts', jsonb_build_object(
      'total', v_total,
      'present', v_present,
      'late', v_late,
      'excused', v_excused,
      'missing', v_missing
    ),
    'last_checks', v_last_checks,
    'announcements', v_announcements,
    'playlist', v_playlist,
    'config', jsonb_build_object(
      'stats_s', coalesce((v_display.settings #>> '{stats_seconds}')::int, 10),
      'announcement_s', coalesce((v_display.settings #>> '{announcement_seconds}')::int, 8),
      'media_s', coalesce((v_display.settings #>> '{media_seconds}')::int, 20),
      'check_overlay_s', coalesce((v_display.settings #>> '{check_overlay_seconds}')::int, 6)
    )
  );
end;
$$;

-- ============================================================
-- Realtime: publicar cambios para el flujo push.
--   attendance INSERT/UPDATE  -> overlay + recount
--   announcements/*           -> refrescar avisos
--   media, display_playlists  -> refrescar playlist
--   displays, display_tokens  -> revocación / estado
-- ============================================================
do $$
begin
  alter publication supabase_realtime add table public.attendance;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.announcements;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.media;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.display_playlists;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.displays;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.display_tokens;
exception when duplicate_object then null; end $$;

-- Payload completo en UPDATE/DELETE (nombre y tipo vienen de joins en
-- el backend, pero el registro completo ayuda a recomputar conteos).
alter table public.attendance replica identity full;

-- ============================================================
-- Security: solo service_role puede ejecutar funciones de display
-- (back-end / CLI). anon y authenticated: bloqueados.
-- ============================================================
alter table public.display_tokens enable row level security;

revoke execute on function public.display_hash_token(uuid, text) from anon, authenticated, public;
revoke execute on function public.assert_display_admin() from anon, authenticated, public;
revoke execute on function public.display_token_rotate(uuid) from anon, authenticated, public;
revoke execute on function public.display_token_revoke(uuid) from anon, authenticated, public;
revoke execute on function public.display_token_revoke_all(uuid) from anon, authenticated, public;
revoke execute on function public.display_authenticate(text, text) from anon, authenticated, public;
revoke execute on function public.display_heartbeat(uuid, boolean, text, text) from anon, authenticated, public;
revoke execute on function public.display_snapshot(uuid) from anon, authenticated, public;

grant execute on function public.display_hash_token(uuid, text) to service_role;
grant execute on function public.assert_display_admin() to service_role;
grant execute on function public.display_token_rotate(uuid) to service_role;
grant execute on function public.display_token_revoke(uuid) to service_role;
grant execute on function public.display_token_revoke_all(uuid) to service_role;
grant execute on function public.display_authenticate(text, text) to service_role;
grant execute on function public.display_heartbeat(uuid, boolean, text, text) to service_role;
grant execute on function public.display_snapshot(uuid) to service_role;