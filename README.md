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

## Firmware (ESP8266)
1. Abre `firmware/firmware.ino` en Arduino IDE.
2. Asegúrate de tener instaladas las librerías: `Adafruit BME280`, `U8g2`, `ArduinoJson`, `NTPClient`.
3. Actualiza:
   - `ssid` y `password` de tu WiFi.
   - `serverName` con la IP local de tu servidor Node.js (ej: `http://192.168.1.10:5000/api/readings`).

## Acceso desde el exterior (Tunnel)
Para ver tu dashboard desde cualquier lugar:
```bash
cloudflared tunnel --url http://localhost:5000
```
Copia la URL `.trycloudflare.com` que te proporcione el terminal.
