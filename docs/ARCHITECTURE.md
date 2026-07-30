# Arquitectura

## Visión general

```
┌─────────────────┐        HTTP POST (JSON)        ┌──────────────────────────┐
│  Firmwares ESP   │ ──────────────────────────────▶ │   Backend Node/Express   │
│  (sensores I2C/  │                                  │   (/backend/index.js)    │
│   UART/BLE)      │ ◀────── GET /api/config/... ──── │                          │
└─────────────────┘                                  │  ┌────────────────────┐  │
                                                       │  │ PostgreSQL (pg)    │  │
                                                       │  │ readings, battery, │  │
                                                       │  │ solar, environment,│  │
                                                       │  │ bms, inverter      │  │
                                                       │  └────────────────────┘  │
                                                       │                          │
                                                       │  Socket.io (WebSocket)   │
                                                       └────────────┬─────────────┘
                                                                    │ eventos en tiempo real
                                                                    ▼
                                                       ┌──────────────────────────┐
                                                       │  Dashboard web            │
                                                       │  (/backend/public/*.html) │
                                                       └──────────────────────────┘
```

Excepción: `firmware_daly_bms_standalone` **no** sigue este flujo. Corre su propio servidor web (`ESPAsyncWebServer`) y expone un dashboard embebido (`web_index.h`) directamente en la IP del ESP32, sin pasar datos al backend central ni a PostgreSQL.

## Componentes

### 1. Firmware (Edge / hardware)

Cada subcarpeta `firmware_*` o `ESP32_Inverter_Monitor` es un sketch de Arduino independiente, compilado y flasheado por separado. Todos comparten el patrón:

- Config sensible en `config.h` (ignorado por git), generado a partir de `config.h.example`.
- Conexión WiFi (`WiFi.begin` en ESP32, o equivalente en ESP8266).
- Lectura periódica del sensor/bus correspondiente (I2C, UART o BLE).
- Envío de una petición `HTTP POST` con JSON al backend (excepto `firmware_daly_bms_standalone`, que es autónomo).

Ver [FIRMWARE.md](./FIRMWARE.md) para el detalle de cada uno.

### 2. Backend (`/backend`)

- **Framework**: Express 5 sobre Node.js.
- **Base de datos**: PostgreSQL vía el driver `pg`, con inicialización/migración automática de tablas en `db.js` (`initDb()`), ejecutada en cada arranque del servidor.
- **Tiempo real**: Socket.io emite un evento distinto por cada tipo de lectura nueva (`newReading`, `newBatteryReading`, `newSolarReading`, `newEnvironmentReading`, `newBmsReading`, `newInverterReading`) para que el dashboard se actualice sin recargar la página.
- **Tareas de fondo**: un `setInterval` cada hora purga registros anómalos de la tabla `readings` (temperatura/presión fuera de rango físico razonable).
- **Puente BMS**: el backend actúa además como intermediario de control — reenvía comandos de carga/descarga hacia el ESP32 que ejecuta `firmware_daly_bms_ble`, usando la IP capturada del último `POST /bms` recibido (ver [BACKEND.md](./BACKEND.md#control-remoto-del-bms)).

### 3. Dashboard (`/backend/public`)

Aplicación estática (HTML + CSS + JS, sin build step ni framework) servida directamente por Express (`express.static('public')`). Incluye vistas normales y vistas "kiosco" (pantalla fija, sin navegación) pensadas para tablets o pantallas dedicadas. Ver [DASHBOARD.md](./DASHBOARD.md).

## Flujo de datos típico (ejemplo BME280)

1. `firmware_BME280` lee temperatura/humedad/presión del sensor cada cierto intervalo.
2. Envía `POST http://SERVER_IP:7755/api/readings` con el JSON de la lectura.
3. `backend/index.js` valida el rango de los valores, calcula el punto de rocío si no vino incluido, inserta en la tabla `readings` y emite `newReading` por Socket.io.
4. El navegador conectado a `index.html` recibe el evento y actualiza gráfico/tarjetas sin recargar.

## Organización del repositorio

```
/backend                     Servidor Node.js + dashboard estático
  /public                    HTML/CSS/JS del dashboard (sin build step)
/docs                        Esta documentación
/firmware_BME280              ESP8266 — clima básico (BME280 + OLED)
/firmware_ina226               ESP8266 — batería individual (INA226)
/firmware_ina228_solar         ESP8266 — panel solar (INA228)
/firmware_display_oled         ESP32 Lolin32 Lite — hub visual OLED
/firmware_daly_bms_ble          ESP32 — puente BLE→backend para BMS Daly/JBD
/firmware_daly_bms_standalone   ESP32 — dashboard local independiente para BMS Daly/JBD
/ESP32_Inverter_Monitor          ESP32 — lectura RS232 de inversor híbrido
```
