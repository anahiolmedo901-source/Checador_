# FASE 3 — Smart Display / TV (Roku OS 16+)

Dashboard en tiempo real para la sucursal: presenta en la pantalla los **checados** conforme
ocurren, y rota entre **contadores del día, últimos checados, avisos y multimedia**.

> **Plataforma:** una TV Roku NO ejecuta React Native. El canal se escribe en
> **BrightScript + SceneGraph** y requiere **Roku OS 16.0+** (introduce `roWebSocket` y SSE en
> `roUrlTransfer`). La tienda Roku también exige `roWebSocket` solo en ese firmware.

---

## Arquitectura

```
 Supabase (PostgreSQL + Realtime)
   │  attendance, announcements, media,
   │  display_playlists, displays, display_tokens
   ▼  channel único (service_role)
 Backend API (Node + Express + ws)
   │  Filtra por sucursal · sanitiza · firma URLs de media
   ▼  WebSocket /api/displays/ws  (push, sin polling)
 Canal Roku (BrightScript/SceneGraph)
   │  DisplayClient (Task + roWebSocket)
   ▼  HomeScene (contadores · últimos · avisos · media)
```

La TV **no tiene** supabase-js ni claves: solo mantiene un WebSocket. El backend es el único
que toca Supabase para displays y valida cada conexión con el mecanismo propio (código + token).

## Flujo de conexión

1. **Registro REST** `POST /api/displays/register` → body `{ code, token, software, os_version }`.
   Devuelve `{ display, wsUrl, snapshot }`. (Endpoint con rate-limit; auth propia en headers/body.)
2. **WebSocket** `wss://…/api/displays/ws` con headers:
   - `Authorization: Bearer <token>`
   - `X-Display-Code: <code>` (nunca van en la URL)
   - **Navegadores/WebView** no pueden fijar headers custom: usan los
     **subprotocolos** `['dc-<code>', 'tk-<token>']` (el servidor los acepta igual).
3. El servidor valida con `display_authenticate` (compara contra el hash), envía
   - `hello`, y el **snapshot** inicial y queda registrado por sucursal.
4. Push: `snapshot`/`check`/`refresh`/`ping`/`revoked`/`unauthorized`/`replaced`.
5. Reintento con backoff exponencial (1 s → 2 s → …→ 30 s) por parte de la TV.

## Protocolo de mensajes (JSON sobre WebSocket)

| Dirección | type       | payload clave                                                              |
|-----------|------------|----------------------------------------------------------------------------|
| S→C       | `hello`    | `{ displayId, code, branchId, ts }`                                        |
| S→C       | `snapshot` | `{ snapshot }` (abajo)                                                     |
| S→C       | `check`    | `{ check: { name, check_type, time, full_time } }` → overlay animado       |
| S→C       | `refresh`  | playlist/contenido cambió; el `snapshot` (debounced) llegará solo           |
| S→C       | `ping`     | keepalive del servidor (la TV lo ignora; el ping WebSocket lo responde sola)|
| S→C       | `revoked`  | token revocado por admin → pantalla de configuración                       |
| S→C       | `unauthorized` | código/token no válido → pantalla de configuración                     |
| S→C       | `replaced` | otra conexión tomó el lugar (mismo display)                                |
| C→S       | `meta`     | `{ software, os_version }` para auditoría                                  |
| C→S       | `heartbeat`| marca online                                                               |

### Snapshot (sanitizado)

```json
{
  "branch": { "id": null, "name": "Sucursal Centro", "address": null },
  "counts":  { "total": 120, "present": 98, "late": 5, "excused": 3, "missing": 14 },
  "last_checks": [
    { "id": "…", "name": "Laura Méndez", "check_type": "late", "label": "Retardo",
      "time": "08:15", "full_time": "08:15:32", "status": "Retardo" }
  ],
  "announcements": [ { "id": "…", "title": "Aviso", "body": "…" } ],
  "playlist": [
    { "position": 0, "item_type": "stats", "duration_s": 8 },
    { "position": 1, "item_type": "announcement", "duration_s": 10,
      "announcement": { "id": "…", "title": "…", "body": "…" } },
    { "position": 2, "item_type": "media", "duration_s": 15,
      "media": { "kind": "video", "file_path": "campanas/promo.mp4",
                 "signed_url": "https://…/AMZN%40…" } }
  ],
  "config": { "stats_s": 8, "announcement_s": 10, "media_s": 15, "check_overlay_s": 6 }
}
```

**Reglas de privacidad (aplicadas por el backend):** nunca viajan fotos de evidencia, ubicación
exacta, NIPs, correos ni tokens; la TV solo ve nombres, tipo de checada, hora y contenido
corporativo. Las URLs de `media` se firman con `storage.createSignedUrl` (bucket `media` privado)
y tienen vigencia ≥ 600 s.

## Mecanismo propio de identificación

- Tabla `display_tokens`: `token_hash` (sha256), `active`, `revoked_at`, `created_by`, `last_used_at`.
  El **token en claro solo se muestra una vez** en la rotación.
- RPC `display_authenticate(p_code, p_token)` valida display activo + token activo y actualiza
  `last_used_at`.
- RPCs de admin (invocadas por el CLI del backend / panel futuro):
  - `display_token_rotate(p_display_id)` → devuelve el nuevo token en claro.
  - `display_token_revoke(p_token_id)` → revoca un token por su id.
  - `display_token_revoke_all(p_display_id)` → revoca todos los tokens de un display.
  - `display_heartbeat(p_display_id, p_online, …)` y `display_snapshot(p_display_id)`.
- Todo grant solo a `service_role`; la RLS deja las tablas bloqueadas a anon/auth.

## Aprovisionamiento del token

```bash
cd supabase
node --env-file-if-exists=.env scripts/token.mjs rotate TV001      # token nuevo (se imprime UNA vez)
node --env-file-if-exists=.env scripts/token.mjs revoke <token-id> # revoca un token concreto
node --env-file-if-exists=.env scripts/token.mjs revoke-all TV001  # revoca todos del display
```

`TV001` se crea en `seed.mjs` (`SEED_TV_PIN` o valor por defecto `123456`).

## Backend (puente)

| Archivo                                   | Responsabilidad                                |
|-------------------------------------------|------------------------------------------------|
| `src/services/display.service.ts`         | auth (RPC), snapshot, firma de URLs de media   |
| `src/services/display-gateway.service.ts` | WSS + registro de TV + suscripción Realtime + debounce + broadcasts |
| `src/controllers/display.controller.ts`   | `register`, `snapshot`                         |
| `src/routes/display.routes.ts`            | enrutado + rate-limit                          |
| `src/server.ts`                           | adjunta el gateway al servidor HTTP            |

Variables nuevas en `backend/.env`:

```
PUBLIC_BASE_URL=https://api.tudominio.mx      # base para wsUrl (si falta, se deriva del request)
DISPLAY_WS_HEARTBEAT_MS=30000                 # ping del WS
SIGNED_URL_EXPIRES_S=300                      # TTL de URLs firmadas (mínimo 600 en displays)
```

El gateway suscribe **un solo canal** (`postgres_changes`) a: `attendance`, `announcements`,
`media`, `display_playlists`, `displays`, `display_tokens`. Los cambios de `announcements`/`media`
refrescan todas las sucursales activas; los de `attendance` solo la sucursal afectada (debounce
~600 ms para absorver ráfagas). `display_tokens.active=false` o `displays.is_active=false` cortan
y notifican a esa TV. La migración 0009 pone `replica identity full` en `attendance` para que el
`DELETE` también llegue completo por Realtime.

## Cliente web `/pantalla` (alternativa a Roku)

Para TVs/paneles con navegador o WebView (Android TV, Chromecast, PC, streaming) el backend
sirve una vista web auto-contenida en **`GET /pantalla`** (`backend/public/pantalla.html`), que
usa el mismo protocolo y credenciales:

- **Configuración:** un código temporal emitido en Administración → Pantallas → Conectar TV. Dura
  10 minutos y solo se acepta una vez; el backend lo intercambia por el token, que se guarda en
  `localStorage` y no se captura ni se muestra en la TV. El backend se detecta desde la URL de
  `/pantalla`.
- **Conexión:** como los navegadores no pueden fijar headers en `WebSocket`, se autentica con
  los **subprotocolos** `['dc-<code>', 'tk-<token>']`; el gateway acepta headers *o* subprotocolos.
- **Contenido:** badge de estado, reloj, contadores del día, últimos checados, avisos/multimedia
  con rotación según `playlist.duration_s`, y **overlay animado** al recibir `check`.
- **Reconexión automática** con backoff exponencial (1 s → 30 s); vuelve a `hello`+`snapshot`.
- **Pantalla completa:** tecla **F** o doble clic.
- CSP propia en la ruta `/pantalla` (scripts/estilos inline + media firmada `https`).

El emparejamiento requiere la migración `0014_display_pairing.sql`. Para Roku se captura además
la dirección base del backend en su configuración inicial, ya que el canal no se abre desde una
URL servida por el backend; el token sigue obteniéndose automáticamente con el mismo código.

Verificado end-to-end contra el gateway: handshake con token, snapshot inicial, overlay de
checada en vivo (Realtime → gateway → WS), refresco de contadores, token inválido → pantalla de
configuración, y reconexión tras recarga.

## Canal Roku (`roku/`)

```
roku/
  manifest                 # requires_fw=16.0
  source/
    main.brs               # arranque del Scene
    helpers.brs            # etiquetas de checada, colores, formato, backoff
    config.brs             # registry (backend, code, token)
  components/
    MainScene.xml/.brs     # decide: actualizar OS / Setup / Home
    SetupScene.xml/.brs    # captura URL+código+token, guarda/borra
    HomeScene.xml/.brs     # dashboard: contadores, últimos, avisos, media, overlay
    DisplayClient.xml/.brs # Task: register REST + roWebSocket + reconexión
```

Comportamientos clave (`HomeScene`):

- **Badge de estado:** `En línea` / `Conectando…` / `Reconectando…` / `Sin conexión` / `No autorizado`.
- **Overlay de checada:** al recibir `check` muestra nombre + tipo (coloreado:
  entrada verde, retardo ámbar, incidencia morada, falta roja) + hora, durante
  `config.check_overlay_s`; el refresco por snapshot actualiza los contadores.
- **Rotación:** `playlist` (stats → avisos → media) con `duration_s` por ítem. Media:
  imagen (`Poster`) o video (`Video` + `ContentNode`), según `kind`/extensión (hls/mp4).
- **Reconexión:** el `DisplayClient` reintenta con backoff exponencial y re-solicita
  registro→WS; al volver, el servidor manda `snapshot` fresco.

Límites conocidos a validar en hardware real: `roWebSocket` espera el header `Origin` en algunos
firmwares (ya se envía), y el rendimiento de `Video` depende del codec (usa H.264/AAC).

## Pruebas automáticas locales

```bash
# Sintaxis de todos los .brs (no ejecuta SceneGraph)
cd tools/brs && node check-brs.cjs

# Funciones puras de helpers.brs (etiquetas, colores, backoff, media, padding)
cd tools/brs && npx brs --root ..\..\roku ..\..\roku\source\helpers.brs smoke.brs
```

## Checklist de las 12 pruebas (en hardware/entorno real)

Requiere: migraciones 0001→0009 aplicadas, `seed.mjs`, backend corriendo con el gateway,
Roku OS 16+ sideload del canal, y el token de `TV001` registrado en la pantalla.

1. **TV conectada** — el badge pasa a `En línea` y se ve `hello` + snapshot inicial.
2. **Nueva asistencia** — un checado desde la app dispara el overlay con nombre/tipo/hora y
   actualiza contadores y último checado.
3. **Retardo** — checada tras hora+tolerancia muestra overlay ámbar `Retardo` y sube ese contador.
4. **Falta** — falta emitida (o ausencia programada) se refleja en el contador de faltas.
5. **Aviso** — un aviso nuevo aparece en la rotación sin reiniciar la TV.
6. **Multimedia** — imagen y video del bucket `media` se muestran con URL firmada.
7. **Desconexión** — apagar red → badge `Sin conexión`, sin crash, panel de estado.
8. **Reconexión** — restaurar red → backoff re-registra y llega snapshot fresco.
9. **Reinicio del canal** — el canal arranca y reconecta solo (config persistida en registry).
10. **Token inválido** — registrar con token incorrecto → `unauthorized`, pantalla de configuración.
11. **Token revocado** — `token.mjs revoke TV001` → la TV recibe `revoked` y muestra configuración.
12. **Ráfaga de eventos** — N checados casi simultáneos solo generan 1 snapshot debounceado
    (sin spam ni pérdida de overlays).
