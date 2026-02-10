# 🌡️ IoT Dashboard - BME280 & ESP8266

Sistema profesional de monitoreo ambiental en tiempo real. Este dashboard permite visualizar datos de temperatura, humedad y presión atmosférica provenientes de un sensor BME280 conectado a un ESP8266, con almacenamiento persistente en PostgreSQL y actualización instantánea vía WebSockets.

## 🚀 Características Principales

*   **Tiempo Real Puro:** Actualización instantánea de datos mediante **Socket.io** sin necesidad de refrescar la página.
*   **Análisis Estadístico:** 
    *   Tendencias calculadas mediante promedios móviles (últimas 5 lecturas) para mayor estabilidad.
    *   Valores Máximos y Mínimos calculados dinámicamente según el rango de tiempo seleccionado.
*   **Diseño Premium:** Interfaz moderna con estética **Glassmorphism**, modo oscuro nativo y totalmente responsivo para móviles.
*   **Independencia Total (100% Offline):** No depende de CDNs externos. Todas las librerías (Chart.js, Lucide, Socket.io) y fuentes (Google Fonts Outfit) están integradas localmente.
*   **Escalabilidad Inteligente:** El backend realiza *Downsampling* automático (promedios por hora) para consultas históricas largas, manteniendo la velocidad del dashboard independientemente del tamaño de la base de datos.
*   **Alertas Dinámicas:** Umbrales de temperatura y humedad personalizables desde el panel de ajustes (guardados en `localStorage`).

## 🛠️ Requisitos Técnico

### Backend
*   **Node.js** v16 o superior.
*   **PostgreSQL** (Base de datos local o remota).
*   Mecanismo de transferencia: SCP o Git.

### Dependencias Principales
*   `express`: Servidor web.
*   `socket.io`: Comunicación bidireccional en tiempo real.
*   `pg`: Cliente de PostgreSQL.
*   `dotenv`: Gestión de variables de entorno.

## 📦 Instalación y Despliegue

1.  **Transferir archivos al servidor:**
    ```bash
    scp -r ./backend usuario@tu-servidor:/ruta/destino
    ```

2.  **Instalar dependencias:**
    ```bash
    cd backend
    npm install
    ```

3.  **Configurar Variables de Entorno:**
    Crea un archivo `.env` en la raíz de la carpeta `backend/`:
    ```env
    PORT=5000
    DB_USER=tu_usuario
    DB_HOST=localhost
    DB_DATABASE=iot_db
    DB_PASSWORD=tu_password
    DB_PORT=5432
    ```

4.  **Inicializar Base de Datos:**
    El servidor ejecutará `db.initDb()` automáticamente al iniciar la primera vez para crear las tablas necesarias.

5.  **Ejecutar en Producción (PM2 Recomendado):**
    Para asegurar que el dashboard esté siempre online:
    ```bash
    npm install -g pm2
    pm2 start index.js --name "iot-dashboard"
    pm2 save
    pm2 startup
    ```

## 📡 Integración con Hardware (ESP8266)

El ESP8266 debe enviar los datos mediante una petición **POST HTTP** al endpoint:
`http://TU_IP:5000/api/readings`

**Formato JSON esperado:**
```json
{
  "temperature": 25.4,
  "humidity": 65.2,
  "pressure": 1013.2,
  "heat_index": 26.1
}
```

## 🎨 Personalización

*   **Alertas:** Haz clic en el icono ⚙️ en el dashboard para cambiar los umbrales de aviso.
*   **Gráfica:** Puedes filtrar qué series de datos ver haciendo clic en los elementos de la leyenda técnica sobre el gráfico.

---
Desarrollado para entornos de monitoreo local con alta disponibilidad.
