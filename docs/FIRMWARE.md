# Firmware

Cada subcarpeta es un sketch de Arduino IDE independiente. Todos (salvo `firmware_daly_bms_standalone`) reportan datos al backend mediante `HTTP POST`.

## Procedimiento general de compilación

1. Entra al directorio del firmware que vas a subir.
2. Copia `config.h.example` a `config.h` y complétalo con tu red WiFi y la URL de tu backend.
3. Abre el `.ino` en Arduino IDE, instala las librerías listadas abajo para ese módulo.
4. Selecciona la placa correcta (ESP8266 o ESP32 según el módulo) y sube el código.

> **Seguridad**: `config.h` está en `.gitignore` (regla `*/config.h`), por lo que nunca se sube al repositorio. Usa siempre `config.h.example` como plantilla.

---

## Tabla resumen

| Directorio | Microcontrolador | Sensor/Bus | Reporta a |
| :--- | :--- | :--- | :--- |
| `firmware_BME280` | ESP8266 | BME280 + OLED SSD1306 (I2C) | `POST {serverName}` → debe ser la URL completa `.../api/readings` |
| `firmware_ina226` | ESP8266 | INA226 (I2C) | `POST {serverName}/battery` |
| `firmware_ina228_solar` | ESP8266 | INA228 (I2C) | `POST {serverName}/solar` |
| `firmware_display_oled` | ESP32 Lolin32 Lite | OLED SSD1306 (I2C) — no tiene sensor propio | `GET {serverName}/battery/latest` y `GET {serverName}/inverter/latest` |
| `firmware_daly_bms_ble` | ESP32 | BMS Daly/JBD (BLE) | `POST {api_url}` → debe ser la URL completa `.../bms` |
| `firmware_daly_bms_standalone` | ESP32 | BMS Daly/JBD (BLE) | No reporta al backend — sirve su propio dashboard web local |
| `ESP32_Inverter_Monitor` | ESP32 | Inversor híbrido (RS232 vía MAX3232) | `POST {serverName}` → debe ser la URL completa `.../api/inverter` |

⚠️ Fíjate en la columna "Reporta a": no todos los firmwares usan `serverName` de la misma forma. Algunos esperan la URL **completa del endpoint** y otros solo la **URL base** a la que le concatenan un sufijo en código. Mezclar el formato de un firmware con la plantilla de otro rompe el envío de datos (ver el bug documentado en [INA226](#ina226) más abajo).

---

## firmware_BME280

**Hardware**: ESP8266 (NodeMCU / Wemos D1 Mini) + sensor BME280 + pantalla OLED SSD1306, ambos por I2C.

**Librerías**: `Adafruit_BME280`, `U8g2` (usa `U8G2_SSD1306_128X64_NONAME_F_HW_I2C`), `ESP8266WiFi`, `ESP8266HTTPClient`, `ArduinoJson`.

**Configuración** (`config.h.example`):
```cpp
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* serverName = "http://YOUR_COMPUTER_IP:7755/api/readings";
```
El código llama `http.begin(client, serverName)` directamente — `serverName` **debe incluir** `/api/readings` completo.

**Wiring**: ver [WIRING.md](./WIRING.md#1-monitor-bme280-esp8266).

---

## firmware_ina226

**Hardware**: ESP8266 + INA226 (monitor de voltaje/corriente para una batería individual), por I2C con `Wire.begin()` (pines por defecto del ESP8266).

**Librerías**: `INA226` (o equivalente), `ESP8266WiFi`, `ESP8266HTTPClient`, `ArduinoJson`.

**Configuración**:
```cpp
const char* serverName = "http://YOUR_COMPUTER_IP:7755/api/readings";
```
El código construye el endpoint como `String(serverName) + "/battery"` (`firmware_ina226.ino:49,155`).

<a name="ina226"></a>
> ⚠️ **Bug detectado en revisión**: la plantilla `config.h.example` de este módulo copia el valor de `firmware_BME280` (`.../api/readings`), pero el código de `firmware_ina226` le agrega `/battery` al final. El resultado real es `http://TU_IP:7755/api/readings/battery`, que **no existe** en el backend (la ruta correcta es `POST /api/battery`, ver [BACKEND.md](./BACKEND.md#batería--battery_readings)). Para que este firmware funcione, `serverName` en tu `config.h` debe ser solo la base:
> ```cpp
> const char* serverName = "http://YOUR_COMPUTER_IP:7755/api";
> ```
> Es el mismo patrón que ya usa correctamente `firmware_ina228_solar`.

**Wiring**: ver [WIRING.md](./WIRING.md#3-monitor-de-batería-ina226-esp8266).

---

## firmware_ina228_solar

**Hardware**: ESP8266 + INA228 (medidor de alta resolución para entrada de panel solar). I2C con pines invertidos: `Wire.begin(D1, D2)` (SDA=D1, SCL=D2).

**Librerías**: `INA228` (Adafruit o equivalente), `ESP8266WiFi`, `ESP8266HTTPClient`, `ArduinoJson`.

**Configuración**:
```cpp
const char* serverName = "http://YOUR_SERVER_IP:7755/api";
const float maxCurrent = 10.0;      // Amperes máximos esperados
const float shuntResistor = 0.015;  // Ohms del shunt
struct WifiNetwork { const char* ssid; const char* password; };
const WifiNetwork networks[] = { {"SSID_1","PASS_1"}, {"SSID_2","PASS_2"} };
```
Soporta **failover entre varias redes WiFi** (a diferencia del resto de firmwares, que solo aceptan una). El endpoint final es `{serverName}/solar` (`POST /api/solar`).

**Calibración**: ajusta `maxCurrent` y `shuntResistor` según tu módulo INA228 físico antes de compilar.

**Wiring**: ver [WIRING.md](./WIRING.md#2-sensor-solar-ina228-esp8266).

---

## firmware_display_oled

**Hardware**: ESP32 Lolin32 Lite + pantalla OLED SSD1306 128x64 (I2C, pines por defecto GPIO21/22). No tiene sensor propio: solo **consume** datos del backend y los muestra.

**Librerías**: `Adafruit_GFX`, `Adafruit_SSD1306`, `AsyncTCP`, `ESPAsyncWebServer`, `ESPmDNS`, `ElegantOTA`, `ArduinoJson`, `HTTPClient`, `WiFi`, `Wire`.

**Configuración**:
```cpp
const char* serverName = "http://YOUR_SERVER_IP:7755/api";
const float fVolt = 28.4;   // Voltaje "batería llena" para estimar SOC %
const float eVolt = 22.0;   // Voltaje "batería vacía"
const int timeOffset = -6;  // Zona horaria (GMT)
```
Consulta `GET {serverName}/battery/latest` y `GET {serverName}/inverter/latest` de forma periódica y rota entre 3 pantallas (Dashboard / Potencia / Info del sistema). Incluye reconexión WiFi automática, alerta visual parpadeante si el SOC estimado cae por debajo del 20 %, y `ElegantOTA` para actualizar por WiFi.

**Wiring**: ver [WIRING.md](./WIRING.md#5-hub-visualizador-oled-esp32-lolin32-lite).

---

## firmware_daly_bms_ble

**Hardware**: ESP32 actuando como **puente** Bluetooth LE ↔ HTTP entre un BMS Daly (o JBD, mismo protocolo de trama que el modo clásico) y el backend.

**Librerías**: `NimBLE-Arduino` (h2zero), `ArduinoJson`, `ESPAsyncWebServer`, `ElegantOTA`, `WiFi`, `HTTPClient`.

**Configuración**:
```cpp
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* api_url  = "http://YOUR_SERVER_IP:7755/bms";
const char* bms_mac  = "00:00:00:00:00:00";  // MAC del BMS (usa nRF Connect para encontrarla)
const unsigned long pollInterval = 60000;    // 60 s
```
`api_url` debe ser la ruta completa `.../bms` (no `/api/bms`) — así lo espera `POST /bms` en el backend.

**Funcionamiento**:
- Se conecta por BLE al servicio `fff0` / características `fff1` (notify) y `fff2` (write), protocolo estándar Daly (tramas de 13 bytes, comandos `0x90`–`0x93`).
- Cada `pollInterval`, solicita SOC, celdas, temperatura y estado de MOSFETs, y hace `POST` al backend — pero **solo si el último dato BLE tiene menos de 150 s** (watchdog anti-datos obsoletos).
- Expone `GET /control?type=charge|discharge&state=0|1` en el propio ESP32 (puerto 80) para que el backend reenvíe ahí las órdenes de `POST /api/bms/control` (ver [BACKEND.md](./BACKEND.md#control-remoto-del-bms)).
- Si no logra conectar al BMS por 10 minutos seguidos, se autoreinicia (`ESP.restart()`).
- `ElegantOTA.begin(&server)` **sin usuario/contraseña** — ver nota de seguridad en [DEPLOYMENT.md](./DEPLOYMENT.md#seguridad).

---

## firmware_daly_bms_standalone

**Hardware**: igual que el anterior (ESP32 + BLE a BMS Daly o JBD), pero **sin conexión al backend central**. Sirve su propio dashboard web embebido (`web_index.h`) directamente desde el ESP32.

**Librerías**: `NimBLEDevice`, `ArduinoJson`, `ESPAsyncWebServer`, `ElegantOTA`, `ESPmDNS`, `WiFi`, `esp_wifi`/`esp_coexist` (ajuste de coexistencia WiFi/BLE).

**Configuración**:
```cpp
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* bms_mac  = "00:00:00:00:00:00";
const char* bms_type = "DALY";   // o "JBD"
const uint8_t bms_addr_type = 0; // 0=PUBLIC, 1=RANDOM
const char* hostname = "dalybms"; // accesible en http://dalybms.local
const unsigned long pollInterval = 10000; // 10 s
```

**Diferencias clave frente a `firmware_daly_bms_ble`**:
- Soporta **dos protocolos BLE**: Daly clásico (servicio `fff0`) y JBD/XiaoXiang (servicio `ff00`), seleccionable con `bms_type`.
- No hace ningún `POST` HTTP hacia afuera. En su lugar expone su propia API local:
  - `GET /` → dashboard HTML embebido.
  - `GET /api/data` → JSON con el estado actual del BMS (voltaje, corriente, SOC, celdas, temperatura, MOSFETs, IP, hostname, RSSI).
  - `GET /control?type=charge|discharge&state=0|1` → control directo de MOSFETs.
  - `GET /restart` → reinicio remoto.
- Se anuncia por mDNS (`http://<hostname>.local`).
- Igual que la versión "puente", `ElegantOTA.begin(&server)` **sin autenticación**.

Úsalo cuando quieras monitorear el BMS de forma aislada (sin backend/PostgreSQL), por ejemplo en una instalación pequeña o como respaldo si el servidor central está caído.

---

## ESP32_Inverter_Monitor

**Hardware**: ESP32 + módulo conversor **MAX3232** para leer, vía RS232→TTL, la trama serie de un inversor híbrido (familia Voltronic y clones — protocolo tipo PowMr). UART2 por hardware: `RXD2 = GPIO15`, `TXD2 = GPIO13`, `INVERTER_BAUD = 2400`.

**Librerías**: `WiFi`, `HTTPClient`, `ArduinoJson`, `ESPAsyncWebServer`, `ElegantOTA` (con autenticación).

**Configuración**:
```cpp
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* OTA_USER = "admin";
const char* OTA_PASS = "admin123";   // cámbialo antes de desplegar
#define INVERTER_BAUD 2400
#define RXD2 15
#define TXD2 13
#define POLL_INTERVAL_MS 10000
#define SEND_INTERVAL_MS 60000
const char* serverName = "http://YOUR_SERVER_IP:7755/api/inverter";
```
`serverName` debe ser la ruta completa `.../api/inverter` (el código hace `http.begin(serverName)` directo, sin concatenar sufijos).

**Funcionamiento**: parsea las tramas RS232 del inversor (voltaje/frecuencia AC, salida, batería, PV, temperatura), lleva contadores de diagnóstico (`tx_count`, `rx_count`, `parse_errors`, `frames_ok`) que también se envían al backend, y expone un dashboard local propio (`web_dashboard.h`) además de reportar a `POST /api/inverter` cada `SEND_INTERVAL_MS`.

**Wiring**: ver [WIRING.md](./WIRING.md#4-inversor-rs232-ttl-esp32).

---

## Módulo retirado: sensor AHT20/BMP280

El sensor **AHT20 + BMP280** (Wemos D1 Mini) ya no está en uso y su página del dashboard (`environment.html`) se eliminó. El backend conserva sin usar las rutas de `environment_readings` (`/api/environment*`) por si se retoma en el futuro — no hay firmware para este sensor en el repositorio, ni lo hubo nunca (la documentación original del proyecto mencionaba una carpeta `firmware_AHT20_BMP280` que tampoco llegó a existir aquí). Si se reactiva este sensor, sigue el mismo patrón que `firmware_BME280` mandando `POST` a `{serverName}/../api/environment` con los campos `temperature`, `humidity`, `pressure` (y opcionalmente `heat_index`, `dew_point`), y vuelve a agregar la página al dashboard y su entrada en `DASHBOARD_PAGES` (`backend/public/js/dashboard-common.js`).
