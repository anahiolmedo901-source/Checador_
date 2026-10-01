-- Códigos de un solo uso para vincular pantallas sin escribir tokens en la TV.
create table if not exists public.display_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  display_id uuid not null references public.displays(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.employees(id) on delete set null
);

create index if not exists display_pairing_codes_display_idx
  on public.display_pairing_codes (display_id, created_at desc);
alter table public.display_pairing_codes enable row level security;
alter table public.display_pairing_codes force row level security;
revoke all on public.display_pairing_codes from anon, authenticated, public;
grant all on public.display_pairing_codes to service_role;

create or replace function public.display_pair_with_code(p_code_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pair public.display_pairing_codes;
  v_display public.displays;
  v_raw text := encode(extensions.gen_random_bytes(24), 'hex');
  v_token_id uuid;
begin
  select * into v_pair
  from public.display_pairing_codes
  where code_hash = p_code_hash and consumed_at is null and expires_at > now()
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'pairing_code_invalid');
  end if;

  select * into v_display from public.displays where id = v_pair.display_id for update;
  if not found or not v_display.is_active then
    update public.display_pairing_codes set consumed_at = now() where id = v_pair.id;
    return jsonb_build_object('ok', false, 'reason', 'display_inactive');
  end if;

  update public.display_pairing_codes set consumed_at = now() where id = v_pair.id;
  update public.display_tokens set active = false, revoked_at = now()
    where display_id = v_display.id and active;
  insert into public.display_tokens (display_id, token_hash, created_by)
    values (v_display.id, public.display_hash_token(v_display.id, v_raw), v_pair.created_by)
    returning id into v_token_id;

  return jsonb_build_object(
    'ok', true,
    'token', v_raw,
    'token_id', v_token_id,
    'display', jsonb_build_object(
      'id', v_display.id, 'name', v_display.name, 'code', v_display.code,
      'status', v_display.status, 'is_active', v_display.is_active,
      'branch_id', v_display.branch_id, 'settings', v_display.settings
    )
  );
end;
$$;

revoke execute on function public.display_pair_with_code(text) from anon, authenticated, public;
grant execute on function public.display_pair_with_code(text) to service_role;
