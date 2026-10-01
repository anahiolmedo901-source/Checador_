-- ============================================================
-- Checador 0011 — FASE 5: Hardening de producción.
--
-- Sin cambios de esquema funcionales: solo índices para consultas
-- calientes, constraints de integridad y notas de operación.
-- Idempotente (safe re-run).
-- ============================================================

-- ---------- Índices para consultas calientes ----------

-- Snapshot de TV y búsqueda admin filtran por sucursal + día + tipo.
create index if not exists attendance_branch_date_type_idx
  on public.attendance (branch_id, check_date, check_type);

-- Búsqueda admin de offtime y detección de traslapes (starts_on/ends_on).
create index if not exists offtime_employee_status_idx
  on public.offtime_requests (employee_id, status);
create index if not exists offtime_starts_ends_idx
  on public.offtime_requests (starts_on, ends_on);

-- Listados admin de multimedia/avisos por estado.
create index if not exists media_active_idx on public.media (active);
create index if not exists announcements_expires_idx on public.announcements (expires_at);

-- Filtro de dispositivos por autorización en el panel.
create index if not exists devices_authorization_idx on public.devices ("authorization");

-- Auditoría: limpieza por antigüedad y orden por fecha.
create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at);

-- Incidencias abiertas por severidad (Dashboard).
create index if not exists incidents_severity_idx on public.incidents (severity);

-- ---------- Constraints de integridad (guardados con DO) ----------

do $$
begin
  alter table public.branches
    add constraint branches_radius_positive check (radius_m >= 0);
exception when duplicate_object then null; end $$;

do $$
begin
  alter table public.branches
    add constraint branches_lat_range check (lat between -90 and 90),
    add constraint branches_lon_range check (lon between -180 and 180);
exception when duplicate_object then null; end $$;

do $$
begin
  alter table public.offtime_requests
    add constraint offtime_dates_ordered check (ends_on >= starts_on);
exception when duplicate_object then null; end $$;

do $$
begin
  alter table public.announcements
    add constraint announcements_expires_after_publish check (expires_at is null or published_at is null or expires_at >= published_at);
exception when duplicate_object then null; end $$;

do $$
begin
  alter table public.attendance
    add constraint attendance_accuracy_non_negative check (accuracy_m is null or accuracy_m >= 0);
exception when duplicate_object then null; end $$;

-- ---------- Anotaciones de operación ----------
-- Revisa periódicamente (cron mensual) y con retención definida por el
-- negocio antes de aplicar housekeeping:
--   delete from public.audit_logs where created_at < now() - interval '12 months';
--   delete from public.attendance where check_date < now() - interval '24 months';
--   delete from public.attendance_evidence where uploaded_at < (retención evidencias);
-- Los buckets de evidencia/media requieren política de retención acordada
-- con RRHH (ver docs/fase5-produccion.md → Backups y retención).