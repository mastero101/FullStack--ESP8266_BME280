# Backend

Servidor en `/backend`, construido con Express 5, PostgreSQL (`pg`) y Socket.io.

## Requisitos

- Node.js v16 o superior.
- PostgreSQL en ejecución (local o remoto).

## Instalación

```bash
cd backend
cp .env.example .env
npm install
```

Edita `.env` con tus credenciales reales:

```env
PORT=7755
DB_USER=tu_usuario
DB_PASSWORD=tu_password
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=tu_base_de_datos
BMS_PIN=123456
```

> **Nota sobre el puerto**: si omites `PORT` en `.env`, el servidor arranca en `5000` (`process.env.PORT || 5000`, ver `backend/index.js:18`). El valor `7755` que verás en todos los ejemplos de `config.h` de los firmwares **solo funciona si lo defines explícitamente** en `.env`, tal como hace la plantilla `.env.example`.

`BMS_PIN` se expone vía `GET /api/config/bms-pin` (por defecto `"000000"` si no está definida) para que el frontend valide un PIN antes de permitir el control remoto del BMS.

## Ejecutar

```bash
npm start        # node index.js
```

El servidor crea/migra automáticamente las tablas al arrancar (`db.initDb()`), y queda escuchando en `http://localhost:<PORT>`.

Para producción se recomienda PM2:

```bash
npm install -g pm2
pm2 start index.js --name "iot-dashboard"
pm2 save
pm2 startup
```

## Esquema de base de datos

Tablas creadas por `backend/db.js`:

| Tabla | Uso | Columnas clave |
| :--- | :--- | :--- |
| `readings` | Clima (BME280) | `temperature`, `humidity`, `pressure`, `heat_index`, `dew_point`, `source`, `timestamp`, `created_at` |
| `battery_readings` | Batería (INA226 y "puente" BMS Daly) | `voltage`, `current`, `power`, `timestamp`, `created_at` |
| `solar_readings` | Panel solar (INA228) | `voltage`, `current`, `power`, `temperature`, `timestamp`, `created_at` |
| `environment_readings` | Ambiente avanzado (AHT20/BMP280) | `temperature`, `humidity`, `pressure`, `heat_index`, `dew_point`, `timestamp`, `created_at` |
| `bms_readings` | BMS Daly/JBD (histórico crudo) | `voltage`, `current`, `soc`, `cell_max_v`, `cell_min_v`, `cell_max_num`, `cell_min_num`, `temp1`, `charge_mos`, `discharge_mos`, `created_at` |
| `inverter_readings` | Inversor híbrido (RS232) | `ac_v`, `ac_f`, `out_v`, `out_w`, `batt_v`, `batt_c`, `pv_v`, `pv_w`, `tx_count`, `rx_count`, `parse_errors`, `frames_ok`, `timestamp`, `created_at` |

`dew_point` (punto de rocío) se calcula con la fórmula de Magnus si no viene en el payload, tanto en el backend (`readings`, `environment_readings`) como opcionalmente en el propio firmware.

> **Nota**: `environment_readings` y sus endpoints/rutas siguen activos y en uso por `/environment.html`, pero actualmente **no hay firmware en este repositorio** que publique datos ahí (ver [FIRMWARE.md](./FIRMWARE.md)).

## Referencia de la API REST

Todas las rutas cuelgan del servidor Express (`backend/index.js`). Formato de fecha para filtros: ISO 8601 (`?startDate=...&endDate=...`).

### Clima — `readings`

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| GET | `/api/readings/latest` | Última lectura |
| GET | `/api/readings?limit=N&startDate=&endDate=` | Histórico (por defecto `LIMIT 100`) |
| GET | `/api/readings/stats?startDate=&endDate=` | Estadísticas globales, últimas 24h y del rango solicitado (min/max/avg/mediana/desv. estándar) |
| POST | `/api/readings` | Inserta lectura. Requiere `temperature`, `humidity`, `pressure`. Valida rangos físicos (T: -25–65 °C, H: 0–100 %, P: 800–1200 hPa) y responde `422` si son anómalos. Emite `newReading` |

### Batería — `battery_readings`

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| GET | `/api/battery/latest` | Última lectura |
| GET | `/api/battery?limit=N&startDate=&endDate=` | Histórico |
| GET | `/api/battery/stats?startDate=&endDate=` | Estadísticas globales, 24h, "hoy" y rango — incluye Wh cargados/descargados |
| POST | `/api/battery` | Inserta lectura. Requiere `voltage`, `current`, `power`. Emite `newBatteryReading` |

### Solar — `solar_readings` (INA228)

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| GET | `/api/solar/latest` | Última lectura |
| GET | `/api/solar?limit=N&startDate=&endDate=` | Histórico |
| GET | `/api/solar/stats?startDate=&endDate=` | Estadísticas globales, 24h y rango |
| POST | `/api/solar` | Inserta lectura. Requiere `voltage`, `current`, `power`; `temperature` opcional. Emite `newSolarReading` |

### Ambiente avanzado — `environment_readings` (AHT20/BMP280)

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| GET | `/api/environment/latest` | Última lectura |
| GET | `/api/environment?limit=N&startDate=&endDate=` | Histórico |
| GET | `/api/environment/stats?startDate=&endDate=` | Estadísticas |
| POST | `/api/environment` | Inserta lectura. Requiere `temperature`, `humidity`, `pressure`. Emite `newEnvironmentReading` |
| GET | `/environment` | Sirve la vista `environment.html` |

### BMS Daly/JBD

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| POST | `/bms` | Recibido desde `firmware_daly_bms_ble`. Guarda en `bms_readings` **y** replica en `battery_readings` (conversión A→mA, cálculo de potencia) para retrocompatibilidad con las vistas que leían del INA226. Registra la IP de origen (`bmsBridgeIp`) para poder enviarle comandos después. Emite `newBmsReading` y `newBatteryReading` |
| GET | `/bms` | Última lectura BMS + `online` (`true` si hubo dato hace menos de 180 s) + `bridge_ip`. Pensado para integrarse con Home Assistant |
| POST | `/api/bms/control` | Body `{ type: "charge"|"discharge", state: true|false }`. Reenvía la orden como `GET http://<bridge_ip>/control?type=...&state=...` al ESP32 que reportó por última vez en `/bms` (timeout 5 s). Devuelve `404` si no hay un puente conocido |
| GET | `/api/config/bms-pin` | Devuelve `{ pin: BMS_PIN }` (variable de entorno) para proteger el panel de control en el frontend |

### Inversor híbrido — `inverter_readings`

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| GET | `/api/inverter/latest` | Última lectura |
| GET | `/api/inverter?limit=N&startDate=&endDate=` | Histórico |
| GET | `/api/inverter/stats?startDate=&endDate=` | Estadísticas globales, 24h, 7d, 30d y rango, incluyendo Wh estimados de PV y salida |
| POST | `/api/inverter` | Inserta lectura (ver campos en el esquema de `inverter_readings`) |
| GET | `/inverter` | Sirve la vista `inverter.html` |

### Vistas / modo kiosco

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| GET | `/kiosk` | `kiosk.html` — panel rotativo general |
| GET | `/kiosk-battery` | `kiosk-battery.html` — panel fijo de batería |
| GET | `/kiosk-solar` | `kiosk-solar.html` — panel fijo de solar |

Ver [DASHBOARD.md](./DASHBOARD.md) para el resto de vistas servidas como archivos estáticos (`index.html`, `battery.html`, `solar.html`).

## WebSocket (Socket.io)

El cliente se conecta al mismo host/puerto del backend. Eventos emitidos por el servidor:

| Evento | Disparado por |
| :--- | :--- |
| `newReading` | `POST /api/readings` |
| `newBatteryReading` | `POST /api/battery` y `POST /bms` (dato replicado) |
| `newSolarReading` | `POST /api/solar` |
| `newEnvironmentReading` | `POST /api/environment` |
| `newBmsReading` | `POST /bms` y tras un `POST /api/bms/control` exitoso (actualización optimista) |
| `newInverterReading` | `POST /api/inverter` |

## Control remoto del BMS

El flujo de control de MOSFETs de carga/descarga del BMS es indirecto porque el ESP32 (`firmware_daly_bms_ble`) no tiene una IP fija conocida de antemano:

1. `firmware_daly_bms_ble` hace `POST /bms` cada `pollInterval` (60 s por defecto) con los datos leídos por BLE.
2. El backend guarda la IP de origen de esa petición en memoria (`bmsBridgeIp`).
3. El frontend llama `POST /api/bms/control` con `{ type, state }`.
4. El backend reenvía `GET http://<bmsBridgeIp>/control?type=...&state=...` directamente al ESP32.

**Limitación**: si el ESP32 aún no ha hecho ningún `POST /bms` desde que arrancó el backend (por ejemplo, tras un reinicio del servidor), `bmsBridgeIp` es `null` y el control devuelve `404` hasta el siguiente reporte automático.

## Limpieza automática de datos

Cada hora (`setInterval`, `backend/index.js:953`), el backend borra de `readings` cualquier fila con temperatura o presión fuera de rango físico razonable, como red de seguridad adicional a la validación que ya se hace en el `POST`.
