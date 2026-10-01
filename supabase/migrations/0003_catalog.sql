-- ============================================================
-- Checador 0003 — Catálogos, roles/RBAC, avisos y displays
-- Modelo de datos definitivo (fase 1)
-- ============================================================

-- ---------- Enums ----------
create type public.employee_role as enum ('admin', 'hr', 'employee');
create type public.attendance_type as enum ('check_in', 'check_out', 'break_out', 'break_in');
create type public.attendance_status as enum ('on_time', 'late', 'out_of_window', 'excused');
create type public.incident_type as enum ('late', 'absent', 'out_of_window', 'location', 'device', 'duplicate', 'other');
create type public.incident_status as enum ('open', 'resolved');
create type public.approval_status as enum ('pending', 'approved', 'rejected');
create type public.off_type as enum ('permission', 'vacation', 'incapacity');
create type public.media_kind as enum ('image', 'video', 'url');

-- ---------- Departamentos ----------
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Puestos ----------
create table public.positions (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments(id),
  title text not null,
  code text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Horarios (reemplaza a `shifts`) ----------
create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  check_in time not null,
  check_out time not null,
  tolerance_min int not null default 5,
  break_min int not null default 30,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Asignación de horario por empleado con vigencia
create table public.employee_schedules (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  schedule_id uuid not null references public.schedules(id),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index employee_schedules_employee_idx on public.employee_schedules (employee_id, effective_from);

-- ---------- Dispositivos móviles registrados ----------
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete set null,
  device_identifier text not null,
  platform text not null check (platform in ('android', 'ios', 'web')),
  model text,
  manufacturer text,
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  constraint devices_identifier_unique unique (device_identifier)
);
create index devices_employee_idx on public.devices (employee_id);

-- ---------- Catálogo RBAC (permisos explícitos por rol) ----------
create table public.role_permissions (
  role public.employee_role not null,
  action text not null,
  primary key (role, action)
);

-- ---------- Pantallas (Smart Display / TV) ----------
create table public.displays (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  branch_id uuid references public.branches(id),
  auth_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'offline' check (status in ('online', 'offline')),
  settings jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- Avisos ----------
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience_role public.employee_role[] not null default array['employee'::public.employee_role],
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  active boolean not null default true,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);
create index announcements_active_idx on public.announcements (active, published_at);

-- ---------- Multimedia ----------
create table public.media (
  id uuid primary key default gen_random_uuid(),
  kind public.media_kind not null,
  title text not null,
  file_path text,
  url text,
  mime_type text,
  size_bytes bigint,
  duration_s int,
  active boolean not null default true,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint media_file_or_url check (kind = 'url' or file_path is not null)
);

-- ---------- Playlists de pantalla ----------
create table public.display_playlists (
  id uuid primary key default gen_random_uuid(),
  display_id uuid not null references public.displays(id) on delete cascade,
  position int not null default 0,
  item_type text not null check (item_type in ('announcement', 'media', 'stats')),
  item_id uuid,
  duration_s int not null default 15,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint display_playlist_item_required check (
    (item_type = 'stats' and item_id is null) or (item_type <> 'stats' and item_id is not null)
  )
);
create index display_playlists_display_idx on public.display_playlists (display_id, position);

-- ---------- Notificaciones ----------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'general',
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, read_at);

-- ---------- Seed de catálogo RBAC ----------
insert into public.role_permissions (role, action) values
  ('admin',   '*'),
  ('hr',      'employees.read'),
  ('hr',      'employees.write'),
  ('hr',      'attendance.read'),
  ('hr',      'reports.export'),
  ('hr',      'offtime.approve'),
  ('hr',      'incidents.manage'),
  ('hr',      'announcements.write'),
  ('hr',      'media.write'),
  ('employee','attendance.self'),
  ('employee','offtime.request'),
  ('employee','profile.self')
on conflict do nothing;