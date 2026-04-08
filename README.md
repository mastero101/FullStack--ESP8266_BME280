# MasterOS IoT: FullStack Dashboard & Sensor Suite

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![Node](https://img.shields.io/badge/node->=16-brightgreen.svg)
![Hardware](https://img.shields.io/badge/hardware-ESP8266%20%7C%20ESP32%20%7C%20Wemos-orange.svg)

Este repositorio contiene la solución alojada unificada de MasterOS para el monitoreo integral de un ecosistema IoT avanzado. Se compone de un servidor central alojado localmente en Node.js, y un conjunto de programas o firmwares específicos (C++) diseñados para correr en diversos microcontroladores. 

Con este ecosistema, es posible recopilar en tiempo real métricas de **ambiente, generación solar fotovoltaica, y rendimiento de componentes del inversor/baterías.**

## 📂 Organización del Repositorio

El proyecto se divide de manera modular:
- `/backend`: Servidor Express en Node.js de alto rendimiento que conecta con la base de datos PostgreSQL, y aloja el código web.
- `/backend/public`: Aplicativo web principal del Dashboard (HTML, CSS, JS puros), utilizando un diseño *Glassmorphism* moderno compatible con móviles.
- `/firmware_*` e `/ESP32_*`: Colección de códigos fuente integrables mediante Arduino IDE para los diversos controladores de domótica.

---

## 🛠️ Requisitos de Software

- **PostgreSQL**: Instalado localmente u hospedado online y ejecutándose.
- **Node.js**: Instalado en tu máquina local o servidor (v16.0 o superior recomenado).
- **Arduino IDE**: Con soporte instalado para tarjetas ESP8266 y ESP32.

---

## 🚀 Configuración del Servidor y Base de Datos (Backend)

1. **Configurar Entorno**: Dirígete a la carpeta `backend/` y copia la plantilla proporcionada `.env.example` en un nuevo archivo que vas a nombrar `.env`. 
2. **Conexión DB**: Abre el nuevo archivo `.env` y rellena las variables de acceso con los detalles de tu motor de base PostgreSQL.
3. **Puesta en marcha**: 
   ```bash
   cd backend
   npm install
   npm start
   ```
4. El servidor se iniciará y migrará/creará las tablas requeridas. Accede al sistema apuntando tu navegador a la URL y puerto configurado: **http://localhost:7755** (Por defecto usa el 7755).

---

## 🔌 Colección de Módulos Físicos Soportados (Firmware)

Cada subcarpeta corresponde a un equipo diferente con un propósito único.

1.  **firmware_BME280**: Sensor integral estándar para Clima (Temp, Humedad, Presión) para ESP8266.
2.  **firmware_AHT20_BMP280**: Estación meteorológica de súper-alta precisión para la placa Wemos D1 Mini.
3.  **firmware_ina226**: Módulo de voltaje/amperaje para evaluación de una Batería individual centralizada.
4.  **firmware_ina228_solar**: Supervisor y analizador métrico acoplado de Alta Resolución de entrada de paneles solares.
5.  **firmware_daly_bms_ble**: Controlador Bluetooth en placa ESP32 para lectura de celdas procedentes de Daly BMS.
6.  **ESP32_Inverter_Monitor**: Lector Serial MAX3232 para extraer datos internos de inversores híbridos vía comunicación RS232.
7.  **firmware_display_oled**: Pantalla oled "Hub" para mostrar la información ya recabada de sensores dentro de la misma red local.

### Compilación y Carga en tu Microcontrolador

1. Ingresa al directorio del firmware que deseas subir. 
2. Copia el archivo llamado `config.h.example` y llámalo únicamente `config.h`.
3. Abre ese modificado `config.h` y cambia los datos de tu red Wifi y la **IP / URL del servidor Node.js backend** al que deseas reportar. (Ej. `http://MI_IP_LOCAL:7755/api`).
4. Abre el archivo principal `.ino` dentro de Arduino IDE y asegúrate de instalar las librerías mencionadas.
5. Sube a la placa.

> [!NOTE] 
> **Seguridad**: Si utilizas Git para hacer forks o clones de este proyecto, todo archivo `config.h` o `.env` se bloqueará e ignorará por seguridad, para que las claves nunca caigan en internet.

---

## 📊 Vistas y Navegación del Dashboard Inteligente

Ingresando desde el navegador al servidor backend:

- **Inicio / Clima (`/index.html`)**: General, métrica histórica de BME280.
- **Ambiental Avanzado (`/environment.html`)**: Medidas AHT20 + BMP280, con cálculo dinámico de Sensación térmica e Índice de punto de Rocío (Dew point).
- **Salud de Baterías (`/battery.html`)**: Evaluación INA226 con métricas estimativas de autonomía.
- **Producción Solar (`/solar.html`)**: Rendimiento fotovoltaico y métrica con sensor moderno INA228.
- **BMS Daly (`/bms.html`) e Inversor (`/inverter.html`)**: Mapeos a nivel de red interna híbrida/BMS a la placa.

---

## 🌐 Mapeo Remoto
Si tienes la aplicación corriendo a nivel local y necesitas observarla desde fuera de tu red sin pagar dominios o abrir puertos:
```bash
cloudflared tunnel --url http://127.0.0.1:7755
```
Comparte e ingresa al enlace autogenerado `.trycloudflare.com`.

---
*Si deseas entender más de la distribución arquitectónica puedes revisar el archivo `DOCUMENTATION.md`.*
