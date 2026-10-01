-- Bucket de evidencias (fotos de checada)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attendance-evidence',
  'attendance-evidence',
  true,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Los empleados autenticados solo pueden subir sus propias evidencias.
create policy "employees upload own evidence"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attendance-evidence'
    and (owner = auth.uid())
  );

-- Lectura pública para admin y Smart Display (los objetos son públicos).
create policy "public read evidence"
  on storage.objects for select
  using (bucket_id = 'attendance-evidence');