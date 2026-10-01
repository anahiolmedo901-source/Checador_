# Checador — Backend API (Fases 1 + 3 + 4 + 5)

API en Node.js + Express + TypeScript sobre Supabase (PostgreSQL + Auth + Storage).
Sirve a la app móvil (Fase 1), hace de puente para el Smart Display/TV (Fase 3), es el
**único backend del panel admin web** `admin/` (Fase 4) y se entrega con pruebas
automatizadas, CI y Docker (Fase 5).

## Requisitos

- Node.js >= 20
- Proyecto Supabase con las migraciones `supabase/migrations/0001…0011` aplicadas en orden

## Instalación

```powershell
# desde backend/
npm install
Copy-Item .env.example .env   # y completa con tus credenciales Supabase
```

## Variables de entorno

| Variable | Descripción |
| --- | --- |
| `PORT` | Puerto del servidor (4000) |
| `NODE_ENV` | `development` / `production` (obligatorio producción) |
| `CORS_ORIGINS` | Orígenes permitidos (separados por coma). En producción si queda vacío se bloquea CORS cross-origin |
| `PUBLIC_BASE_URL` | Dominio público del API (se emite en `wsUrl` de las TVs) |
| `SUPABASE_URL` | URL del proyecto |
| `SUPABASE_ANON_KEY` | Anon key (solo auth login/getUser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (solo backend: DB, storage, admin Auth) |
| `RATE_LIMIT_WINDOW_MS` | Ventana del rate-limit global (ms) |
| `RATE_LIMIT_MAX` | Máximo de requests globales por ventana/IP |
| `LOGIN_RATE_LIMIT_MAX` | Intentos de login permitidos por ventana/IP (429) |
| `SIGNED_URL_EXPIRES_S` | Vigencia de URLs firmadas (segundos) |
| `DISPLAY_WS_HEARTBEAT_MS` | Heartbeat del WebSocket de la TV (ms) |

## Scripts

```powershell
npm run dev        # desarrollo (tsx watch)
npm run build      # compilar TypeScript -> dist/
npm run start      # producción (requiere build previo)
npm run typecheck  # chequeo de tipos (tsc --noEmit)
npm test           # suite Vitest + Supertest (44 pruebas, mocks de Supabase)
```

## Rutas principales

| Ruta | Descripción |
| --- | --- |
| `POST /api/auth/login` | Login email + NIP (rate-limit de fuerza bruta) |
| `GET/POST/PATCH /api/employees` | Empleados (CRUD, búsqueda `?search=`, paginación, RBAC) |
| `GET/POST/PATCH /api/schedules` | Horarios (admin/hr) |
| `GET /api/displays/snapshot` | Snapshot para TV (auth propia + URLs firmadas) |
| `POST /api/displays/register` | Registro de pantalla (código + token) |
| `GET /api/admin/attendance` | Búsqueda de asistencia vía RPC admin |
| `GET /api/admin/reports/by-day` | Reporte de asistencia por día |
| `GET /api/admin/reports/by-dimension` | Reporte por empleado/departamento/sucursal |
| `GET /api/health` | Alive check |
| `GET /api/health/detailed` | `{ db: ok/error, uptime, version, timestamp }` |

## Docker

```bash
docker build -t checador-backend:prod .
docker run -d --name checador-api -p 4000:4000 --env-file .env.production checador-backend:prod
```

Imagen multi-stage sobre `node:20-alpine`, usuario no root, sin dependencias de dev.

## CI

`.github/workflows/ci.yml` (en la raíz del repo): typecheck + tests + build de backend y admin.

## Más información

- Producción, monitoreo y retención: `docs/fase5-produccion.md`
- Plan de pruebas (automatizadas + manuales): `docs/fase5-pruebas.md`
- Checklist de liberación: `docs/checklist-produccion.md`