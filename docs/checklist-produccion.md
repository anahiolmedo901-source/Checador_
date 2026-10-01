# Checklist de producción

Antes de liberar el sistema (backend + panel admin + móvil + Smart Display).

## Código

- [ ] `backend/`: `npm test` → 44 passed
- [ ] `backend/`: `npm run typecheck` → sin errores
- [ ] `admin/`: `npm run typecheck` → sin errores
- [ ] `backend/` y `admin/`: `npm run build` → exitosos
- [ ] CI verde en GitHub Actions para la rama a desplegar

## Base de datos (Supabase)

- [x] Migraciones `0001…0015` aplicadas **en orden** (confirmado por el usuario).
- [x] `0011_production_hardening.sql` aplicado (incluido en la secuencia confirmada).
- [ ] Buckets privados: `attendance-evidence`, `media`, `avatars` (sin política de lectura pública).
- [ ] Seeded: catálogos (departamentos, puestos, horarios, sucursales), admin y usuarios demo
      creados sólo con `scripts/seed.mjs`.
- [ ] `service_role` solo en el backend del servidor; `anon` solo para auth/login de la app.
- [ ] Backup programado habilitado en Supabase.

## Backend

- [ ] `NODE_ENV=production`, `CORS_ORIGINS` con la URL real del panel.
- [ ] `PUBLIC_BASE_URL` = dominio público del API (usa la TV para `wsUrl`).
- [ ] Contenedor/instancia escucha en `:4000`, usuario no root.
- [ ] `GET /api/health` responde 200 desde el balanceador.
- [ ] `GET /api/health/detailed` con `db: ok`.
- [ ] Logs (pino) a stdout y recolectados.

## Panel admin

- [ ] Accesible solo por HTTPS.
- [ ] Login de admin funciona contra producción.
- [ ] Búsqueda de empleados filtra correctamente.
- [ ] Editar evento de asistencia escribe auditoría.
- [ ] Exportación (Excel/PDF) probada.

## Móvil

- [ ] Confirmar que `com.volme.checador` está disponible y pertenece a la cuenta de publicación antes del primer build de tienda; no cambiarlo después de publicar.
- [ ] Crear/vincular proyecto EAS en la cuenta propietaria y cargar `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` como variables del entorno `preview` y `production`.
- [ ] `eas build --profile preview --platform all` instala y abre en equipos reales.
- [ ] `eas build --profile production --platform all` termina antes del envío a tiendas.
- [ ] Build interno `preview` instalado en dispositivo real con biometría, cámara, GPS y SecureStore.
- [ ] Escenarios 1–19 de `docs/fase5-pruebas.md` pasados en iPhone y Android/panel admin.
- [ ] Modo offline probado: el intento de checada se bloquea y no se guarda sin conexión.
- [ ] Sesión persiste entre reinicios (SecureStore).

## Smart Display (TV Roku)

- [ ] Registro con código+token validado.
- [ ] Checadas en vivo se reflejan en la TV.
- [ ] Reconexión con backoff tras caída de red.
- [ ] Escenarios 1–6 de `docs/fase5-pruebas.md` pasados.
- [ ] Cliente web `/pantalla` (navegador/WebView): render, token en `localStorage`,
      reconexión automática y pantalla completa (tecla F).
- [ ] **Política de retención pendiente de aprobación de RRHH/Legal:** acordar plazos para asistencia, auditoría y evidencias antes de activar borrados automáticos. La migración no borra información.

## Seguridad / cumplimiento

- [ ] CORS en producción solo con orígenes listados.
- [ ] Errores 401/403/500 no filtran datos internos.
- [ ] Rate-limit de login (429 tras N intentos).
- [ ] Retención de `attendance` ≥ 2 años definida en operación.
