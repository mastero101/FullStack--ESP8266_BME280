# Dashboard Web

Aplicación estática servida por Express desde `backend/public` (`express.static('public')`). Sin build step: HTML + CSS puro + JS vanilla, con estética *Glassmorphism*, modo oscuro nativo y diseño responsivo. Todas las librerías (Chart.js, Socket.io client, iconos, fuentes) están integradas localmente — no depende de CDNs externos.

## Vistas principales

| Ruta | Archivo | Contenido |
| :--- | :--- | :--- |
| `/` o `/index.html` | `index.html` | Clima general (histórico BME280) |
| `/battery.html` | `battery.html` | Salud de batería (INA226 y/o BMS Daly), autonomía estimada |
| `/solar.html` | `solar.html` | Producción fotovoltaica (INA228) — **oculta del menú de navegación** (sensor desconectado por ahora), sigue accesible por URL directa |
| `/inverter` o `/inverter.html` | `inverter.html` | Datos del inversor híbrido (RS232) |

> `/inverter` está servida explícitamente por una ruta de Express (`app.get('/inverter', ...)`); el resto de páginas `.html` se sirven automáticamente por `express.static`. No existe un `bms.html` independiente: los datos del BMS Daly/JBD (voltaje, SOC, celdas, control de MOSFETs) se muestran integrados dentro de `battery.html`, ya que el backend replica cada lectura de `/bms` también en `battery_readings` (ver [BACKEND.md](./BACKEND.md#bms-dalyjbd)).
>
> **`environment.html` (Ambiental AHT20) se eliminó** — el sensor ya no está en uso. El backend conserva sin usar los endpoints `/api/environment*` y la tabla `environment_readings` por si se retoma en el futuro (ver [FIRMWARE.md](./FIRMWARE.md#módulo-retirado-sensor-aht20bmp280)).
>
> La navegación (desktop y móvil) de las páginas activas se genera desde una sola lista en `backend/public/js/dashboard-common.js` (`DASHBOARD_PAGES`) — agregar o quitar una sección del menú es editar esa lista, no cada página por separado.

## Modo kiosco

Pensado para pantallas fijas (tablets, monitores dedicados) sin barra de navegación:

| Ruta | Archivo | Uso |
| :--- | :--- | :--- |
| `/kiosk` | `kiosk.html` | Panel rotativo general |
| `/kiosk-battery` | `kiosk-battery.html` | Panel fijo de batería |
| `/kiosk-solar` | `kiosk-solar.html` | Panel fijo de solar |

## Tiempo real

Cada vista se conecta por Socket.io al mismo host del backend y escucha el evento correspondiente a su tipo de dato (`newReading`, `newBatteryReading`, `newSolarReading`, `newEnvironmentReading`, `newBmsReading`, `newInverterReading` — ver [BACKEND.md](./BACKEND.md#websocket-socketio)) para refrescar tarjetas y gráficos sin recargar la página.

## Control del BMS desde el dashboard

Las vistas de batería/BMS permiten activar o desactivar los MOSFETs de carga/descarga llamando a `POST /api/bms/control`. El backend valida contra `BMS_PIN` (expuesto vía `GET /api/config/bms-pin`) antes de reenviar la orden al ESP32 puente. Ver el flujo completo en [BACKEND.md](./BACKEND.md#control-remoto-del-bms).

## Personalización

- **Alertas**: ícono ⚙️ en el dashboard para configurar umbrales de temperatura/humedad, guardados en `localStorage` del navegador (no persisten en el backend).
- **Gráficos**: clic en los elementos de la leyenda para mostrar/ocultar series individuales. Filtros de rango de 1 hora, 1 día o 7 días, con *downsampling* automático (promedios por hora) en el backend para consultas largas.
