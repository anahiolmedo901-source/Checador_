-- ============================================================
-- Checador 0012 — Correctivo: RLS en announcements y notifications.
-- 0006 definió políticas de lectura para ambas, pero las tablas
-- quedaron fuera de la lista de `enable row level security`/`force`.
-- Sin RLS, la clave anon/authenticated podía leer, insertar, editar
-- y borrar TODOS los avisos y notificaciones.
-- ============================================================

alter table public.announcements enable row level security;
alter table public.announcements force row level security;

alter table public.notifications enable row level security;
alter table public.notifications force row level security;