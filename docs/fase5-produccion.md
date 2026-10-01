# FASE 5 — Producción

Endurecimiento, pruebas automatizadas y despliegue. Objetivo: llevar el sistema (móvil +
Smart Display + panel admin) a producción con verificaciones automáticas, sin regresión de
seguridad y con monitoreo.

---

## 1. Qué se entregó en esta fase

### 1.1 Suite de pruebas automatizadas (backend)

`backend/tests/` — **Vitest + Supertest** contra la app Express real con mocks de Supabase
(spies sobre los singletons, sin `vi.mock`). 8 suites:

| Suite | Cubre |
| --- | --- |
| `auth.test.ts` | login, tokens, 401, fuerza bruta |
| `employees.test.ts` | CRUD, paginación, búsqueda `or ilike`, permisos |
| `schedules.test.ts` | CRUD de horarios, roles admin/hr |
| `health.test.ts` | `/api/health` y `/api/health/detailed` |
| `display.test.ts` | registro TV, token revocado, snapshot firmado |
| `media.test.ts` | listado, creación por URL, upload a storage, tipos no permitidos |
| `attendance.test.ts` | búsqueda/edición vía RPC admin, incidencias, permisos |
| `security.test.ts` | rate-limit login, CORS, helmet, 404, no filtración de stack |

Ejecución:

```powershell
cd backend
npm test            # vitest run
npm run typecheck   # tsc --noEmit
```

### 1.2 Bugs reales encontrados y corregidos por las pruebas

- Express 4 no captura rechazos de middlewares `async`: **un error interno devolvía 500 sin
  cuerpo**. Se añadió `withAsync()` (`src/utils/async-handler.ts`) y se envolvieron todos los
  controladores async (auth, employee, schedule, department, position, branch, file, admin,
  employee-schedule, display)
- El error-handler filtraba `message` y `stack` en NODE_ENV≠prod → **ahora siempre devuelve
  500 genérico** `{success:false, error:{code:'INTERNAL_ERROR', message:'Error interno del servidor.'}}`,
  sin importar el entorno (no filtra datos de la base).
- El esquema de query de listado de empleados (**Zod strip**) eliminaba el parámetro `search`
  → el buscador del panel no filtraba. Añadido `employeeListQuerySchema` con `search`,
  `department_id`, `active`.
- `multer` error de tipo TS en `FILE_TYPE_NOT_ALLOWED` → cast `as never` + mapeo a 400 `INVALID_UPLOAD`.
- El mock de `select(SELECT, {count})` no detectaba `wantCount` → `total` siempre 0. Corregido.

### 1.3 Endurecimiento de permisos y storage

- `src/services/permission.service.ts` ahora expone `has`, `hasAny` e `invalidate` (caché
  invalidable; el mock la usa para los tests).
- Auditoría de buckets completada: `attendance-evidence`, `media` y `avatars` son **privados**;
  solo el backend firma URLs de corta duración. Rutas `files.*` protegidas con
  `requireAnyPermission(['files.read','files.attendance.self'])` y verificación IDOR en
  `file.service.ts`.

### 1.4 Migración 0011 — índices y constraints de producción

`supabase/migrations/0011_production_hardening.sql` (aplicar manualmente, ver §3):

- Índices: `attendance(branch_id, check_date, check_type)`, `offtime_requests(employee_id, status)`,
  `offtime_requests(starts_on, ends_on)`, `media(active)`, `announcements(expires_at)`,
  `devices(authorization)`, `audit_logs(created_at)`, `incidents(severity)`.
- CHECK constraints con guardas `DO` (idempotente): `branches.radius_m >= 0`,
  `lat` en ±90, `lon` en ±180, `offtime ends_on >= starts_on`, `announcements expires_at >= published_at`,
  `attendance.accuracy_m >= 0`.

---

## 2. CI / CD

`.github/workflows/ci.yml` — en cada push a `main` y PR:

- **backend**: `npm ci` → typecheck → tests → build (Node 20, cache npm).
- **admin**: `npm ci` → typecheck → build (Vite).

El despliegue es manual (ver §3); el CI garantiza que solo entra código verde.

---

## 3. Despliegue (backend)

### 3.1 Docker

Desde `backend/`:

```bash
docker build -t checador-backend:prod .
docker run -d --name checador-api -p 4000:4000 \
  --env-file .env.production \
  checador-backend:prod
```

`Dockerfile` multi-stage (build → runtime `node:20-alpine`, usuario no root, sin dependencias
de dev). `.dockerignore` evita `node_modules`, `dist`, `.env`, `tests`.

### 3.2 Aplicar la migración 0011 antes de liberar

```sql
-- Ejecutar en el SQL Editor del proyecto de PRODUCCIÓN
\i supabase/migrations/0011_production_hardening.sql
```

Es idempotente (guarda `DO`), puede re-ejecutarse sin riesgo.

### 3.3 Variables de producción

Ver `backend/.env.production.example`. Puntos críticos:

- `NODE_ENV=production` obligatorio.
- `CORS_ORIGINS` = URL exacta del panel admin. Si no se define, los navegadores cross-origin
  quedan bloqueados (comportamiento intencional).
- `PUBLIC_BASE_URL` = dominio público del API (se emite en `wsUrl` de las TVs).
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` del proyecto **de producción**.
  `service_role` vive solo en el servidor, nunca en clientes.

---

## 4. Monitoreo y operación

| Recurso | Uso |
| --- | --- |
| `GET /api/health` | Alive check (200) para load balancer / uptime |
| `GET /api/health/detailed` | Estado `db: ok/error`, `uptime`, `version`, `timestamp` |

Propuesta de chequeos:

- Uptime: consulta `/api/health` cada 30 s.
- Base de datos: `/api/health/detailed`, alerta si `db != ok`.
- Logs: pino a stdout; recolectar (p. ej. contenedor → stdout → log driver / loki).

### Retención de datos (recomendada)

- `attendance` + `attendance_evidence` guardar **≥ 2 años** (convenio laboral México).
- `audit_logs` conservar 1 año; limpiar los más antiguos con job programado.
- `media` y `announcements` viejos: revisar y archivar.

---

## 5. Resumen de seguridad ya activa

- Helmet + trust proxy + `x-powered-by` desactivado.
- Rate-limit global y específico de login (429).
- CORS estricto en producción (deny por defecto si no hay lista).
- RBAC server-side (`requirePermission`) más `requireAnyPermission` en archivos.
- Buckets privados + URLs firmadas de corta duración.
- Errores 500 genéricos sin fuga de stack/mensajes internos.
- Búsquedas con `ilike` escapadas por PostgREST (sin inyección vía URL).