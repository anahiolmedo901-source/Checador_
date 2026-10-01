-- ============================================================
-- Checador 0007 — Storage por buckets privados + acciones RBAC
-- para el backend (Fase 1).
-- Evidencia laboral NO se expone públicamente: se sirve mediante
-- URLs firmadas generadas por el backend.
-- ============================================================

-- ---------- Buckets ----------
-- `attendance-evidence`: pasa a privado (antes público).
update storage.buckets
set public = false
where id = 'attendance-evidence';

-- Buckets adicionales (privados siempre).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('media',  'media',  false, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']),
  ('avatars','avatars',false,  5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Quitar la lectura pública que ya no aplica.
drop policy if exists "public read evidence" on storage.objects;

-- Subida de evidencias: solo por los empleados autenticados, a su carpeta
-- propia (owner = auth.uid() = employee.id). El backend (fase en curso)
-- opera con service_role y no necesita política.
-- La política se redefine desde 0002: se elimina primero para que la
-- migración sea idempotente (de lo contrario 0007 fallaría y el bucket
-- seguiría público con lectura abierta).
drop policy if exists "employees upload own evidence" on storage.objects;
create policy "employees upload own evidence"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attendance-evidence'
    and (owner = auth.uid())
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------- Acciones RBAC adicionales para el backend ----------
-- `admin` ya tiene '*' en 0003. HR obtiene lectura de catálogos,
-- asignación de horarios y acceso a firmar URLs de contenido.
insert into public.role_permissions (role, action) values
  ('hr', 'branches.read'),
  ('hr', 'branches.write'),
  ('hr', 'departments.read'),
  ('hr', 'positions.read'),
  ('hr', 'positions.write'),
  ('hr', 'schedules.read'),
  ('hr', 'schedules.assign'),
  ('hr', 'files.read')
on conflict do nothing;

-- Empleados pueden firmar sus propias evidencias de asistencia.
insert into public.role_permissions (role, action) values
  ('employee', 'files.attendance.self')
on conflict do nothing;