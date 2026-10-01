-- Alinea el día laboral y los horarios de asistencia con la hora de Hermosillo.
insert into public.app_settings (key, value)
values ('default_timezone', to_jsonb('America/Hermosillo'::text))
on conflict (key) do update
set value = excluded.value,
    updated_at = now();
