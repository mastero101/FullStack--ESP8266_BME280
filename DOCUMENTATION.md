# MasterOS IoT Dashboard & Sensor Suite Documentation

## Proyecto General

Este repositorio aloja la solución completa de MasterOS para el monitoreo de un ecosistema IoT avanzado. Está dividido en un servidor backend escalable, una interfaz gráfica web responsiva con diseño premium, y múltiples firmwares para microcontroladores (ESP32/ESP8266) dedicados a sensores ambientales, energéticos y de control.

### Arquitectura de la Solución

1.  **Frontend (UI/UX):** Hospedado de manera local y servido con Express. Posee interfaces responsivas especializadas (Clima, Calidad de Aire, Solar, Baterías y BMS) que consumen los endpoints REST API en tiempo real. 
2.  **Backend (API & Lógica):** Desarrollado en Node.js con Express (`/backend`). Se encarga de procesar los datos recibidos por los microcontroladores, almacenarlos en PostgreSQL, y servirlos o transmitirlos a través de la web.
3.  **Base de Datos:** PostgreSQL local, donde la estructura (`db.js`) inicializa o migra tablas para cada módulo (readings, battery_readings, solar_readings, environment_readings, bms_readings, inverter_readings).
4.  **Hardware Edge (Firmware):** Diferentes placas basadas en ESP8266, ESP32 y Wemos D1 Mini se conectan a diferentes sensores I2C o UART para inyectar su data intermitentemente a la API.

---

## Firmwares y Hardware Soportado

| Directorio | Microcontrolador | Hardware / Sensores | Función |
| :--- | :--- | :--- | :--- |
| `firmware_BME280` | ESP8266 | BME280 + SSD1306 | Sensor Meteorológico Básico (Temp, Hum, Presión) |
| `firmware_AHT20_BMP280` | Wemos D1 Mini | AHT20 + BMP280 | Sensor de Ambiente Alta Precisión |
| `firmware_ina226` | ESP8266 | INA226 | Monitorizador de Voltaje, Corriente de baterías |
| `firmware_ina228_solar` | ESP8266 / ESP32 | INA228 | Análisis granular de Panel Solar |
| `firmware_display_oled` | ESP32 Lolin32 Lite | Pantalla OLED SSD1306 | Hub oled visual de métricas extraidas de la red (WiFi) |
| `firmware_daly_bms_ble` | ESP32 | BLE (Bluetooth Low Energy) | Recolección de datos métricos de BMS Daly por Bluetooth |
| `ESP32_Inverter_Monitor` | ESP32 | RS232, MAX3232 | Integración comunicación UART con Inversor híbrido |

---

## Seguridad de Credenciales y Prácticas de GitHub

**El proyecto se encuentra sanitizado.** Por reglas de seguridad en la comunidad Open Source, **los archivos de configuración (`config.h`, `.env`) NO son incluidos en el control de versiones** para evitar la filtración de contraseñas de red (WIFI), credenciales de bases de datos, API KEYS o contraseñas OTA.

**¿Cómo levantar el entorno a partir de un `git clone`?**
Cada entorno del repositorio tiene plantillas llamadas `config.h.example` o `.env.example`.
Debes copiarlas o renombrarlas eliminando la extensión `.example`, e incorporar tus propios datos reales, como se estipula en el `README.md` principal.

### Lista de Archivos Excluidos (Por el `.gitignore`):
- `backend/.env`
- `*/config.h` (Aplicado dinámicamente a todas las carpetas)
- NodeModules, Build logs, Archivos binarios y `.elf`/`.bin`

---

## Estilos y Componentes de Interfaz Web (Frontend)

El stack del frontend funciona con HTML modular y CSS puro basándose en tendencias UI innovadoras:
- **Glassmorphism:** Efectos borrosos de fondo en barras de navegación y tarjetas de estadística para un aura "Premium".
- **Responsive:** Modificaciones para adaptación móvil (`@media queries`) en barras de pestañas interactuables.
- **Micro-interacciones:** Los botones y tarjetas aumentan gradualmente su escala, iluminan su sombra e integran transiciones fluidas en estado `:hover`.
- **Gráficos Dinámicos:** Configurados internamente (suele usarse `Chart.js`) para mostrar líneas temporales o tendencias de 1 hora, 1 día o 7 días.

---

## Iniciar y Operar (Checklist)

1. **Instanciación Servidor:** Verificar PostgreSQL activo -> Duplicar `.env` -> `npm install` -> `npm start`.
2. **Setup C++ (Sensores):** Instalar librerías -> Copiar `config.h.example` a `config.h` -> Editar red WIFI/Server API -> Flashear placa.
3. **Monitoreo:** Entrar desde red local a `http://localhost:5000` (o el puerto modificado) para revisar telemetría de todos los endpoints.
