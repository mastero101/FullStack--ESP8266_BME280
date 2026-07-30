# Documentación — Home IoT: FullStack Dashboard & Sensor Suite

Índice de la documentación técnica del proyecto. Para una introducción rápida y puesta en marcha en 5 minutos, consulta el [README principal](../README.md).

## Contenido

| Documento | Contenido |
| :--- | :--- |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Arquitectura general, flujo de datos y organización del repositorio |
| [BACKEND.md](./BACKEND.md) | Instalación del servidor, variables de entorno, esquema de base de datos y referencia completa de la API REST/WebSocket |
| [FIRMWARE.md](./FIRMWARE.md) | Detalle de cada firmware (hardware, librerías, configuración, endpoint al que reporta) |
| [WIRING.md](./WIRING.md) | Diagramas de conexión (pinout) de cada sensor/módulo |
| [DASHBOARD.md](./DASHBOARD.md) | Vistas del dashboard web, modo kiosco y personalización |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Puesta en producción (PM2), acceso remoto (Cloudflare Tunnel) y seguridad de credenciales |
| [IMPROVEMENT_PLAN.md](./IMPROVEMENT_PLAN.md) | Plan de implementación priorizado: testing, CI/CD y observabilidad |
| [FRONTEND_IMPROVEMENT_PLAN.md](./FRONTEND_IMPROVEMENT_PLAN.md) | Plan de implementación del frontend: navegación centralizada y JS/CSS compartido entre dashboards |

## Resumen del proyecto

El repositorio implementa un ecosistema de monitoreo IoT doméstico compuesto por:

1. **Backend** (`/backend`): servidor Node.js/Express + PostgreSQL + Socket.io que recibe, almacena y transmite en tiempo real las métricas de todos los sensores.
2. **Dashboard web** (`/backend/public`): interfaz HTML/CSS/JS con diseño *Glassmorphism*, sin dependencias de CDN externas.
3. **Firmwares** (`/firmware_*`, `/ESP32_Inverter_Monitor`): siete conjuntos de código para ESP8266/ESP32 que leen sensores físicos y reportan datos al backend (o, en un caso, sirven su propio dashboard local).

## Hallazgos de la revisión (2026-07-30)

Durante la elaboración de esta documentación se revisó el código fuente actual (backend y firmwares) contra la documentación previa en la raíz del proyecto. Se detectaron los siguientes puntos, ya corregidos o señalados en esta nueva documentación:

- **Directorio inexistente**: la documentación anterior mencionaba `firmware_AHT20_BMP280`, pero esa carpeta no existe en el repositorio actual. El backend y el dashboard (`/environment.html`, tabla `environment_readings`) siguen activos para ese sensor, pero no hay firmware publicado que los alimente hoy. Ver nota en [FIRMWARE.md](./FIRMWARE.md).
- **Módulos no documentados**: `firmware_daly_bms_standalone` (dashboard local en el propio ESP32, sin pasar por el backend) no aparecía en ningún documento previo. Se agregó su propia sección.
- **Endpoints no documentados**: rutas como `POST/GET /bms`, `POST /api/bms/control`, `GET /api/config/bms-pin` y las vistas `/kiosk`, `/kiosk-battery`, `/kiosk-solar` no estaban descritas. Ahora están cubiertas en [BACKEND.md](./BACKEND.md) y [DASHBOARD.md](./DASHBOARD.md).
- **Bug de configuración**: la plantilla `firmware_ina226/config.h.example` define `serverName` como una URL completa (`.../api/readings`), pero el código de ese firmware le concatena `"/battery"`, generando la URL inválida `.../api/readings/battery`. La ruta correcta del backend es `/api/battery`. Ver detalle y la corrección sugerida en [FIRMWARE.md](./FIRMWARE.md#ina226).
- **OTA sin autenticación**: `firmware_daly_bms_ble` y `firmware_daly_bms_standalone` inicializan `ElegantOTA` sin usuario/contraseña, a diferencia de `ESP32_Inverter_Monitor` que sí exige `OTA_USER`/`OTA_PASS`. Es una superficie de ataque en la red local si no se controla el acceso al WiFi. Ver [DEPLOYMENT.md](./DEPLOYMENT.md#seguridad).
- **Puerto por defecto**: el código (`backend/index.js`) usa `process.env.PORT || 5000` como *fallback*, no 7755. El puerto 7755 solo se usa porque así lo define `backend/.env.example`. Aclarado en [BACKEND.md](./BACKEND.md).
