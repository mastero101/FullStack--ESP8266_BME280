# IoT Station - Local Backend & Dashboard

Este proyecto ha sido simplificado para ejecutarse completamente desde el backend de Node.js, sirviendo tanto la API como la interfaz visual.

## Estructura

- `/backend`: Servidor Express que guarda los datos en PostgreSQL y sirve el dashboard web.
- `/backend/public`: Frontend estático (HTML/CSS/JS) con diseño premium.
- `/firmware`: Código para el ESP8266.

## Requisitos
- **Base de Datos**: PostgreSQL ya instalado y corriendo en tu servidor local.
- **Node.js**: Instalado en tu máquina.

## Configuración del Backend
1. Edita el archivo `backend/.env` con las credenciales de tu base de datos PostgreSQL local.
2. Inicia el servidor:
   ```bash
   cd backend
   npm install
   npm start
   ```
3. Accede al dashboard en: `http://localhost:5000`

## Firmwares disponibles (ESP8266/ESP32)

1.  **firmware_BME280**: Para ESP8266 + BME280 + SSD1306.
2.  **firmware_AHT20_BMP280**: Nuevo firmware para Wemos D1 Mini + AHT20 + BMP280 + SH1106 (1.3" OLED).
3.  **firmware_display_oled**: Dashboard visualizador para ESP32.
4.  **firmware_ina226**: Monitor de batería.

### Configuración del Firmware
1. Abre el archivo `.ino` correspondiente en Arduino IDE.
2. Asegúrate de tener instaladas las librerías: `Adafruit BME280`, `Adafruit AHTX0`, `Adafruit BMP280`, `U8g2`, `ArduinoJson`, `NTPClient`.
- `serverName` con la IP local de tu servidor Node.js.
   - **Nota**: El BME280 usa `/api/readings`, el AHT20 usa `/api/environment`, y la Batería usa `/api/battery`.

## Dashboard y Secciones

- **Principal `/index.html`**: Monitoreo BME280 (Clima).
- **Ambiental `/environment.html`**: Monitoreo AHT20 + BMP280 (Estación Alta Precisión).
- **Batería `/battery.html`**: Monitoreo INA226 (Sistema Energético).
- **Solar `/solar.html`**: Rendimiento Fotovoltaico.


## Acceso desde el exterior (Tunnel)
Para ver tu dashboard desde cualquier lugar:
```bash
cloudflared tunnel --url http://localhost:5000
```
Copia la URL `.trycloudflare.com` que te proporcione el terminal.
