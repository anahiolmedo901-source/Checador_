# Checador — App móvil de control de asistencia

Sistema profesional de control de asistencia. La app móvil permite al empleado registrar sus
checadas (**entrada, salida a comida, regreso de comida, salida**) confirmando identidad con
**biometría** (huella/Face ID), tomando una **fotografía de evidencia** y validando su
**ubicación** contra la geocerca de su sucursal.

Arquitectura completa (móvil / Smart Display / panel admin) diseñada sobre **Supabase**
(PostgreSQL + Auth + Storage + Realtime).

## Stack

- React Native + **Expo SDK 57** + TypeScript
- **Expo Router** (file-based routing)
- Supabase (Auth + PostgreSQL + Storage)
- Biometría: `expo-local-authentication` · Cámara: `expo-camera` · GPS: `expo-location`
- Identificación del dispositivo: `expo-device` + `expo-crypto` + `expo-secure-store`
- Detección de red: `expo-network`

## Estructura

```
supabase/
  migrations/        # Esquema + funciones SQL + RLS + Storage (0001 → 0018)
  SCHEMA_MAESTRO.sql # Esquema consolidado (alternativa a correr 0001..0011 una por una)
  fixes/             # Parches puntuales para bases ya desplegadas
  scripts/           # seed.mjs, token.mjs, test-display.mjs
backend/             # API Node.js + Express + TS (Fase 1)
admin/               # Panel administrativo web (Fase 4) — Vite + React + Mantine
roku/                # Canal Roku para el Smart Display (Fase 3)
docs/                # Guías: display-fase3, checklist-produccion, fase5-*
src/
  app/               # Pantallas (Expo Router)
    _layout.tsx      # Auth gate + navegación
    index.tsx        # Redirect raíz
    (auth)/login.tsx # Login con código + NIP
    (tabs)/          # Inicio (checar) · Historial · Perfil
    check.tsx        # Flujo de checada (biometría→foto→ubicación→guardado)
    confirm.tsx      # Confirmación tras guardar una checada
    attendance/[id].tsx  # Detalle de un día (eventos + evidencias + sucursal)
    config.tsx       # Estado del dispositivo + biometría + política offline
  components/        # UI reutilizable
  context/           # AuthProvider (sesión + perfil + dispositivo)
  hooks/             # useSessionState (jornada abierta + siguiente checada)
  lib/               # supabase, device, network, evidence, biometrics, location, settings, dates, errors
  types/             # Tipos compartidos
```

## Cómo se autentica el empleado

Cada empleado existe en **Supabase Auth** con email `{codigo}@check.local` y contraseña = **NIP**.
La app compone el email a partir del código y firma con el NIP (sesión persistida en SecureStore).

## Setup

### 1. Backend (Supabase)

1. Crea un proyecto en [supabase.com](https://supabase.com) (o `npx supabase start` en local).
2. Ejecuta las migraciones en `supabase/migrations/` en orden (SQL Editor):
   - `0001_schema.sql` — tablas, funciones de fichaje, RLS, restricciones.
   - `0002_storage.sql` — bucket `attendance-evidence`.
   - `0003_catalog.sql` — enums, catálogos (departamentos/puestos/horarios), RBAC, avisos y displays.
   - `0004_attendance.sql` — modelo por sesiones/eventos, evidencias, ausencias e incidencias.
   - `0005_attendance_functions.sql` — RPC compatibles con la app móvil.
   - `0006_security.sql` — RLS/auditoría/grants.
   - `0007_storage_and_rbac.sql` — buckets privados (`attendance-evidence`, `media`, `avatars`) + acciones RBAC.
   - `0008_mobile_phase.sql` — FASE 2 móvil: autorización de dispositivos (`register_device`,
     `assert_device_usable`), registro de checadas con `p_idempotency_key` (idempotencia anti
     duplicados), geocerca server-side (`assert_geo_ok`), `my_session_state`, `attendance_detail`,
     vista `attendance_list` con sucursal, y política de storage “read own evidence”.
- `0009_display_phase.sql` — FASE 3 Smart Display/TV: `display_tokens` (hash + revocación),
      RPCs `display_authenticate`/`display_heartbeat`/`display_snapshot`, publicación Realtime
      de tablas y `replica identity full` para el puente posterior de la TV.
   - `0010_admin_phase.sql` — FASE 4 panel admin: RBAC ampliado, catálogo `role_permissions`,
      tablas `announcements`/`media`/`display_playlists`/`devices`, RPCs de búsqueda
(`admin_attendance_search` con `session_id`, `admin_attendance_detail`,
       `admin_attendance_events`, `admin_offtime_list`, `admin_incident_list`,
       `admin_statistics`), auditoría (`audit_log` + RPC), y vista `admin_reports_rollup`.
- `0011_production_hardening.sql` — endurecimiento de producción: índices extra, restricciones
      CHECK y **política de retención de datos** (bloque por defecto, pendiente de activar).
- `0012_security_rls.sql` — endurecimiento final de RLS/seguridad.
   - `0013_fix_admin_attendance_search.sql` — corrige `admin_attendance_search` (error 500
     “each UNION query must have the same number of columns” en Asistencia). Si ya tenías la BD
     desplegada, basta con `supabase/fixes/0001_fix_admin_attendance_search.sql`.
   - `0014_display_pairing.sql` — códigos de emparejamiento de un solo uso para vincular
      pantallas sin escribir tokens en la TV.
   - `0015_attendance_date_correction.sql` — al corregir una entrada recalcula la fecha laboral de la sesión y protege el orden cronológico.
   - `0016_mobile_simplification_and_shift_window.sql` — quita la espera de autorización de dispositivos y valida la ventana de entrada en el servidor.
   - `0017_hermosillo_timezone.sql` — alinea el día laboral y la validación de horarios con la hora de Hermosillo.
   - `0018_mobile_admin_read_only_catalogs.sql` — habilita la lectura móvil protegida de empleados y horarios, sin el backend HTTP.

> **Instalación rápida:** en una base nueva ejecuta `supabase/SCHEMA_MAESTRO.sql` (equivale a 0001–0011) y después las migraciones 0012 a 0018 en orden.
3. Configura RLS activo: las operaciones de la app pasan por funciones `security definer`;
   el acceso directo a tablas está bloqueado. El backend usa la `service_role`.

### 2. Variables de entorno

```bash
cp .env.example .env          # macOS / Linux / Git Bash
# PowerShell: Copy-Item .env.example .env
```

```
EXPO_PUBLIC_SUPABASE_URL=          # Project Settings → API
EXPO_PUBLIC_SUPABASE_ANON_KEY=     # anon / public key
SUPABASE_SERVICE_ROLE_KEY=         # solo para seed / backend / panel admin
# SEED_ADMIN_PIN / SEED_RH_PIN / SEED_EMP_PIN / SEED_TV_PIN (opcional)
```

> La app móvil consulta Supabase directamente y no necesita configurar una IP ni un servidor dentro del teléfono. Su panel Admin solo permite consultar empleados y horarios.
>
> ⚠️ **Nunca subas tu `.env` al repositorio ni lo compartas** (contiene la `service_role`).
> Si se filtró, rota las claves en Supabase → Project Settings → API.

### 3. Seed (datos demo)

```bash
node --env-file-if-exists=.env supabase/scripts/seed.mjs
```

Crea: buckets, sucursal, departamento, puesto, horario y usuarios demo
(`ADMIN01` admin, `RH001` RH, `EMP001` empleado, `TV001` pantalla).

### 4. Correr la app

```bash
npm install
npx expo start          # QR para Expo Go / emulador
```

### 5. Backend API (opcional, Fase 1)

```bash
cd backend
npm install
cp .env.example .env          # (PowerShell: Copy-Item .env.example .env) — completa credenciales Supabase
npm run dev                   # http://localhost:4000
```

Endpoints y pruebas en `backend/README.md`.

### 6. Smart Display / TV (Fase 3)

La TV es una **pantalla Roku** (BrightScript + SceneGraph, **Roku OS 16+**): se identifica con un
**código + token** propio (hash en `display_tokens`, revocables), recibe por **WebSocket** los
checados en tiempo real y rota entre **contadores, últimos checados, avisos y multimedia**. El
backend hace de puente: escucha Supabase **Realtime** con la `service_role` y reenvía a la TV un
mensaje sanitizado (sin fotos, ubicación, NIPs ni tokens).

Guía completa (protocolo, aprovisionamiento, sideload, checklist de 12 pruebas):
**`docs/display-fase3.md`**.

```bash
# 1) Backend con gateway de displays (opcional para desarrollo solo móvil)
cd backend
cp .env.example .env          # (PowerShell: Copy-Item …) — añade PUBLIC_BASE_URL=https://api.tudominio.mx
npm run dev

# 2) Rotar/generar el token de la pantalla TV001
node --env-file-if-exists=.env supabase/scripts/token.mjs rotate TV001
```

En la TV: Configuración → developer → *Install channel* con el `roku/` comprimido, y en el primer
arranque captura URL del backend, código y token.

### 7. Panel administrativo (Fase 4)

**Panel admin web** en `admin/` (Vite + React + **Mantine 7** + TanStack Query + Zod). Habla
**solo con el backend** (`/api` vía proxy a `http://localhost:4000`) — nunca con la `service_role`.

```bash
cd admin
npm install
cp .env.example .env          # (PowerShell: Copy-Item …) — el backend ya incluye http://localhost:5173 en CORS_ORIGINS
npm run dev                   # http://localhost:5173
```

- **Acceso:** un admin o miembro de RH entra con su email y NIP (login `POST /api/auth/login`).
  Un usuario `employee` obtiene 403; el rol determina qué módulos y botones se ven
  (RBAC espejo de `role_permissions`, la autoridad es el backend).
- **Módulos:** Dashboard, Empleados (alta/edición/desactivar + asignación de horarios),
  Horarios, Asistencia (filtros + detalle con sesión/eventos/evidencias y edición de eventos),
  Incidencias (permisos/vacaciones/incapacidades + avisos), Sucursales, Departamentos, Puestos,
  Pantallas (crear + token descargable), Dispositivos (autorizar/denegar), Avisos, Multimedia,
  Playlists, Reportes (CSV/Excel/PDF, por día / empleado / departamento / sucursal) y
  **Auditoría** (bitácora inmutable con antes/después).
- **Responsivo:** en pantallas < 48 em las tablas se desplazan horizontalmente dentro de su
  contenedor, los modales/cajones ocupan toda la pantalla, los filtros se apilan y se respetan
  las áreas seguras (notch / barra de gestos) mediante `viewport-fit=cover` y `env(safe-area-inset-*)`
  (`admin/src/responsive.css`).
- **Validaciones:** todos los formularios usan Zod + `@mantine/form`, con mensajes en español
  (`admin/src/lib/zod-es.ts`). Ejemplos: enlaces multimedia `http(s)` obligatorios y duración
  1–3600 s, rango de fechas coherente en Reportes, teléfono y códigos con formato restringido.
  El backend valida de nuevo cada petición (fuente de verdad).
- El backend registra todas las acciones en `audit_log` con actor, acción, entidad, diffs, IP
  y `created_at`.

> Para validar biometría, cámara, GPS y SecureStore usa el build interno `preview` (`npx eas-cli@latest build --profile preview --platform all`). La cámara funciona en Expo Go; la disponibilidad de biometría depende de la plataforma.

### Builds EAS

`eas.json` incluye los perfiles internos `preview` y de tienda `production`, con la URL y la clave
pública anon de Supabase incluidas para que los builds remotos usen el mismo proyecto que el `.env`
local. Si cambia el proyecto, actualiza ambos perfiles y el `.env`. Antes del primer build, vincula
el proyecto con la cuenta EAS propietaria (`npx eas-cli@latest project:init`) y confirma que los
identificadores `com.volme.checador` estén disponibles. No cargues `SUPABASE_SERVICE_ROLE_KEY` en la app.

## Flujo de checada

1. En **Inicio**, la app consulta `my_session_state`: si tienes una jornada abierta muestra su
   estado, y siempre ofrece el botón del **siguiente paso** (`entrada → salida a comida →
   regreso de comida → salida`).
2. **Biometría** (si está activada) confirma la identidad.
3. **Foto** de evidencia (selfie cámara frontal) — es obligatoria en todas las checadas.
4. **Ubicación** → se calculan la distancia a la sucursal y el radio permitido
   (radio de sucursal + precisión del GPS). Fuera de rango se bloquea. La ubicación es
   **obligatoria en todas las checadas**: sin servicios de GPS, sin permiso, con precisión
   > 100 m o con ubicación simulada (mocked) se bloquea el registro.
5. Guarda: sube la foto a Storage y ejecuta la RPC correspondiente
   (`record_check_in` / `record_break_out` / `record_break_in` / `record_check_out`) enviando
   `p_device_id`, `p_lat`, `p_lon`, `p_accuracy_m` y `p_idempotency_key`. La idempotencia
   garantiza que un reintento no duplique la checada.
6. **Confirmación:** `confirm.tsx` muestra la hora, el estado y la evidencia firmada;
   `attendance/[id]` muestra todos los eventos del día con sus fotos.

**Dispositivos:** el primer dispositivo del empleado se autoriza automáticamente
(`register_device`); los siguientes quedan pendientes. El servidor es la **fuente de verdad**:
`assert_device_usable` valida autorización/activación antes de cada checada.

**Sin checadas offline:** la app exige conexión (`assertOnline`). La hora, geocerca e idempotencia
se validan en el servidor con `now()`; la evidencia se sube antes de guardar.

**Validación de tardanza:** el horario vigente viene de la asignación `employee_schedules`.
Ingresó tras `hora_inicio + tolerancia` → `late`; sin horario asignado → `out_of_window`;
por defecto el retardo se calcula con `schedules.tolerance_min`.

## Validaciones de lint / tipos

```bash
npx expo lint      # ESLint (app móvil)
npx tsc --noEmit   # TypeScript (app móvil)
npx expo-doctor    # Diagnóstico de proyecto

cd admin && npm run typecheck   # TypeScript (panel admin)
cd backend && npm run typecheck && npm test
```

## Siguientes módulos (roadmap)

- ✅ **Smart Display/TV** (FASE 3): dashboard en tiempo real para **Roku OS 16+**
  (`roku/`) con WebSocket + Realtime del backend; protocolo y pruebas en `docs/display-fase3.md`.
- ✅ **Panel admin** (FASE 4): CRUD de empleados, horarios, sucursales (geocercas), asistencia,
  incidencias, avisos, multimedia, playlists, pantallas, dispositivos, reportes (CSV/Excel/PDF)
  y auditoría. Sección 7 arriba.
