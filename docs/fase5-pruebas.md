# FASE 5 — Plan de pruebas

Pruebas automatizadas (Vitest, corren en CI) + pruebas manuales E2E sobre dispositivo real.

---

## 1. Automatizadas (backend)

```powershell
cd backend
npm test
```

8 suites / ~44 casos. Cubren autenticación, permisos por rol, CRUD de empleados/horarios,
registro/snapshot de Smart Display, media (incl. tipos de archivo no permitidos), RPC admin
de asistencia y los controles de seguridad (rate-limit, CORS, helmet, filtrado de 500).

> Una suite completa debe terminar en **44 passed**. Junto con `npm run typecheck`
> (tsc limpio) son los gates del CI de GitHub Actions.

---

## 2. Mapa de pruebas manuales — asistencia (15 escenarios)

Dispositivo: iPhone/Android con **Expo Go dev build**. Configurar una sucursal con geocerca
uso de prueba.

| # | Escenario | Pasos | Resultado esperado |
| --- | --- | --- | --- |
| 1 | Entrada correcta | Con GPS dentro de la geocerca, biometric ok, foto ok | Se guarda evento `check_in`, se ve en Historial |
| 2 | Entrada con foto | Foto con poca luz / fuera de cuadro | Se guarda; evidencia adjunta visible |
| 3 | Entrada sin GPS | Ubicación desactivada | Se bloquea con mensaje claro (o pasa a `gps` en `gps_ok=false` según política) |
| 4 | Entrada fuera de geocerca | GPS válido pero lejos de la sucursal | Se bloquea con error de ubicación |
| 5 | Entrada con biometría fallida | Huella incorrecta | Se pide reintentar o fallback PIN |
| 6 | Entrada duplicada | Checar entrada 2 veces el mismo día | No crea duplicado; devuelve error controlado |
| 7 | Salida a comida | Después de una entrada válida | Evento `meal_out` registrado |
| 8 | Regreso de comida | Después de `meal_out` | Evento `meal_in` registrado |
| 9 | Salida final | Jornada con entrada+comida | Evento `check_out`, jornada cerrada |
| 10 | Secuencia inválida | Intentar `check_out` sin entrada | Error 400 con mensaje |
| 11 | Sin conexión (offline) | Volar en modo avión e intentar checar | Se bloquea con mensaje claro y no se crea una checada en el servidor |
| 16 | Corregir entrada a día anterior | Desde Asistencia, cambiar fecha de entrada al día anterior conservando la hora; volver a abrir el detalle y reportes | La fecha laboral de toda la sesión se actualiza a la fecha local de la entrada; el evento sigue en orden y no duplica otra entrada del empleado |
| 17 | Corrección cronológica inválida | Mover una salida antes de la entrada o regreso antes de salida a comida | El servidor rechaza el cambio y conserva todos los eventos y la auditoría anterior |
| 18 | Rango de fechas inválido | Consultar Desde posterior a Hasta o una fecha imposible | La interfaz/servidor rechaza el rango y muestra un mensaje entendible |
| 19 | Horario inválido | Crear/editar salida igual o anterior a entrada; asignación termina antes de empezar | El servidor rechaza el dato |
| 12 | Panel admin: búsqueda | Buscar por nombre/código en Empleados | Filtra en el listado |
| 13 | Panel admin: editar evento | Abrir detalle de un día y corregir evento con motivo | Guarda y aparece en auditoría |
| 14 | Panel admin: incidencia | Registrar incidencia (tardanza/ausencia) | Se crea y aparece en el registro |
| 15 | Multi-sucursal | Empleado se mueve a otra sucursal | Solo puede checar en su sucursal asignada |

## 3. Mapa de pruebas manuales — Smart Display (TV Roku)

| # | Escenario | Resultado esperado |
| --- | --- | --- |
| 1 | Registro con código+token válidos | Muestra `hello` + snapshot por WebSocket |
| 2 | Token revocado / código erróneo | Recibe `revoked`/`unauthorized`, no se conecta |
| 3 | Checada en vivo en la TV | El contador/last-checks de la sucursal se actualiza al instante |
| 4 | Rotación de avisos y media | Playlist rota; media se muestra con URL firmada válida |
| 5 | Caída de red de la TV | Reconecta con backoff exponencial y recupera snapshot |
| 6 | Dos TVs misma sucursal | Ambas reciben el mismo push |

## 4. Chequeo final antes de liberar

- [ ] `npm test` verde en `backend/` (44 passed).
- [ ] `npm run typecheck` sin errores en `backend/` y `admin/`.
- [ ] `npm run build` exitoso en `backend/` y `admin/`.
- [ ] Migraciones `0011` a `0015` aplicadas al proyecto de producción.
- [ ] Escenarios 1–15 de asistencia probados en dispositivo real.
- [ ] Escenarios 1–6 de Smart Display probados en TV real.
