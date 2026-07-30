# Plan de Implementación: Observabilidad y Testing/CI-CD

> **Para quien ejecute este plan:** cada tarea es independiente y termina con un commit propio. Se recomienda ejecutarlas en orden dentro de cada fase (hay dependencias técnicas: Fase 2 necesita los tests de la Fase 1; el resto son independientes entre sí). Usa `anthropic-skills:subagent-driven-development` o `anthropic-skills:executing-plans` si quieres delegar la ejecución tarea por tarea.

**Objetivo:** cerrar las dos brechas priorizadas tras la revisión del proyecto — el backend no expone métricas ni tiene backups automatizados de la base de datos (Observabilidad), y el pipeline de CI/CD solo valida sintaxis sin tests reales, sin chequeo de firmware, ni verificación post-deploy (Testing y CI/CD).

**Arquitectura:** todo lo de Observabilidad se apoya en la infraestructura que ya corre en `masteroserver` (Prometheus, Grafana, Docker) en vez de agregar herramientas nuevas. Todo lo de Testing/CI-CD extiende `.github/workflows/deploy.yml` y agrega un workflow nuevo para firmware, reutilizando el runner self-hosted y el runner de GitHub ya configurados.

**Stack:** Node.js/Express (backend), PostgreSQL, GitHub Actions, Prometheus/Grafana (ya desplegados), `node:test` + `supertest` (nuevo, testing), `arduino-cli` (nuevo, CI de firmware).

## Restricciones globales

- No romper compatibilidad de la API pública consumida por los firmwares (rutas, formato de payloads).
- Ningún cambio debe requerir tocar `firmware_*/config.h` reales (solo se usan los `.example` en CI).
- Los cambios de servidor (systemd, Prometheus, cron/timers) no los puedo ejecutar yo — cada tarea que los necesite trae los comandos exactos para correr por SSH, igual que el resto de esta conversación.
- Mantener el estilo existente: comentarios en español, identificadores en inglés, sin frameworks nuevos si una librería chica alcanza.

---

## Estado (actualizado)

✅ **Fase 0** — `npm audit fix` (commit `a8a0c70`), 0 vulnerabilidades.
✅ **Fase 1** — `index.js` importable + tests con `supertest` (commits `34751f2`, `35d3c3a`). 6/6 pasando localmente contra Postgres real.
✅ **Fase 2** — `validate` corre los tests contra un Postgres real de servicio + smoke test post-deploy (commit `dd54b40`).
⏭️ **Fase 3 (CI de firmware)** — **omitida a propósito**: el usuario pidió no tocar nada relacionado a firmware en esta sesión ("es complicado reflashear controladores"). El plan de la Fase 3 sigue abajo por si se retoma más adelante.
✅ **Fase 4** — completa: endpoint `/metrics` (commit `ee4e115`) + Prometheus conectado en `masteroserver` (`bme280-station` scrapeando `192.168.1.89:7755`, confirmado `UP` en `/targets`).
✅ **Fase 5** — script de backup creado y verificado (commit `63b94d2`). Falta activar el timer de systemd en el servidor (Tarea 5.2, requiere SSH).
✅ **Fase 6** — job de retención configurable (commit `e333761`), query verificada contra Postgres real.

---

## Fase 1 — Fundamento de testing en el backend

### Tarea 1.1: Hacer `index.js` importable sin efectos secundarios

**Por qué primero:** ahora mismo `backend/index.js` hace `server.listen(...)` y arranca un `setInterval` en cuanto se hace `require()` del archivo — así que ningún test puede importar la app sin levantar un servidor real en el puerto 7755 y dejar un timer corriendo para siempre (cuelga el proceso de test).

**Archivos:**
- Modificar: `backend/index.js` (líneas ~939–964, la sección `--- SERVER & SOCKET ---` hasta el final del archivo)

- [ ] **Paso 1:** Envolver el arranque del servidor y el cron de limpieza en un guard `require.main === module`, y exportar `app`/`server`:

```js
// --- SERVER & SOCKET ---

io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id);
    socket.on('disconnect', () => {
        console.log('Cliente desconectado');
    });
});

if (require.main === module) {
    server.listen(port, () => {
        console.log(`Backend running on http://localhost:${port}`);
    });

    // Data Cleanup Job (Hourly)
    setInterval(async () => {
        try {
            const queryText = "DELETE FROM readings WHERE temperature > 65 OR temperature < -25 OR pressure < 800 OR pressure > 1200";
            const result = await db.query(queryText);
            if (result.rowCount > 0) {
                console.log(`[LIMPIEZA] ${result.rowCount} registros eliminados.`);
            }
        } catch (err) {
            console.error("[LIMPIEZA ERROR]", err);
        }
    }, 3600000); // 1 Hour
}

module.exports = { app, server };
```

- [ ] **Paso 2:** Verificar que `npm start` sigue funcionando igual (comportamiento en producción no debe cambiar, porque `node index.js` hace `require.main === module` verdadero):

```bash
cd backend
npm start
# Ctrl+C tras ver "Backend running on http://localhost:7755"
```

- [ ] **Paso 3:** Commit

```bash
git add backend/index.js
git commit -m "refactor: make index.js importable without side effects for tests"
```

### Tarea 1.2: Agregar `supertest` y el arnés de tests

**Archivos:**
- Modificar: `backend/package.json`
- Crear: `backend/test/readings.test.js`
- Crear: `backend/test/bms.test.js`

**Interfaces:**
- Consume: `{ app, server }` exportados en la Tarea 1.1, y `db.initDb()` / `db.query()` de `backend/db.js` (sin cambios).
- Produce: comando `npm test` funcional, usado por la Fase 2.

- [ ] **Paso 1:** Instalar `supertest` como dependencia de desarrollo (usa `node:test`, incluido en Node 22, no hace falta un test runner aparte):

```bash
cd backend
npm install --save-dev supertest
```

- [ ] **Paso 2:** Crear `backend/test/readings.test.js`:

```js
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const db = require('../db');
const { app, server } = require('../index');

before(async () => {
    await db.initDb();
});

after(async () => {
    server.close();
});

test('POST /api/readings rechaza payload incompleto', async () => {
    const res = await request(app).post('/api/readings').send({ temperature: 22 });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Missing data');
});

test('POST /api/readings rechaza temperatura fuera de rango fisico', async () => {
    const res = await request(app).post('/api/readings').send({
        temperature: 999, humidity: 50, pressure: 1000
    });
    assert.equal(res.status, 422);
});

test('POST /api/readings acepta una lectura valida y calcula dew_point', async () => {
    const res = await request(app).post('/api/readings').send({
        temperature: 22.5, humidity: 55, pressure: 1013.2, heat_index: 23.1
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.temperature, 22.5);
    assert.ok(res.body.dew_point > 0 && res.body.dew_point < 22.5);
});

test('GET /api/readings/latest devuelve la lectura mas reciente', async () => {
    await request(app).post('/api/readings').send({
        temperature: 30, humidity: 40, pressure: 1005
    });
    const res = await request(app).get('/api/readings/latest');
    assert.equal(res.status, 200);
    assert.equal(res.body.temperature, 30);
});
```

- [ ] **Paso 3:** Crear `backend/test/bms.test.js` — este cubre el "parche" de `POST /bms` que replica en `battery_readings` convirtiendo unidades (A→mA, W→mW), la parte más frágil del archivo (el propio código fuente tiene un comentario `// Wait, ...` dudando de las unidades):

```js
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const db = require('../db');
const { app, server } = require('../index');

before(async () => {
    await db.initDb();
});

after(async () => {
    server.close();
});

test('POST /bms guarda la lectura y la replica en battery_readings con unidades correctas', async () => {
    const payload = {
        voltage: 26.4, current: 5.2, soc: 87,
        cell_max_v: 3.31, cell_min_v: 3.28,
        cell_max_num: 4, cell_min_num: 7,
        temp1: 24, charge_mos: true, discharge_mos: true
    };
    const res = await request(app).post('/bms').send(payload);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');

    const battery = await request(app).get('/api/battery/latest');
    assert.equal(battery.status, 200);
    assert.equal(battery.body.voltage, 26.4);
    // El backend guarda current en mA (Amperes * 1000), igual que esperaba el INA226
    assert.equal(battery.body.current, 5200);
});

test('GET /bms reporta online:true justo despues de un POST', async () => {
    await request(app).post('/bms').send({
        voltage: 26, current: 1, soc: 90, cell_max_v: 3.3, cell_min_v: 3.29,
        cell_max_num: 1, cell_min_num: 2, temp1: 25, charge_mos: true, discharge_mos: true
    });
    const res = await request(app).get('/bms');
    assert.equal(res.status, 200);
    assert.equal(res.body.online, true);
});
```

- [ ] **Paso 4:** Cambiar el script `test` en `backend/package.json` (reemplaza el stub que siempre fallaba):

```json
"scripts": {
    "start": "node index.js",
    "test": "node --test test/"
}
```

- [ ] **Paso 5:** Correr los tests localmente contra tu Postgres local (usa el mismo `.env` que ya tienes configurado — los tests escriben datos reales de prueba en tus tablas, así que corre esto contra una base de desarrollo, no producción):

```bash
cd backend
npm test
```

Esperado: todos los tests en verde. Si falla por conexión a la base, confirma que `backend/.env` apunta a un Postgres accesible.

- [ ] **Paso 6:** Commit

```bash
git add backend/package.json backend/package-lock.json backend/test/
git commit -m "test: add supertest coverage for readings and bms routes"
```

---

## Fase 2 — Endurecer el pipeline de CI/CD

### Tarea 2.1: Correr los tests reales en el job `validate` contra Postgres real

**Archivos:**
- Modificar: `.github/workflows/deploy.yml`

**Interfaces:**
- Consume: `npm test` de la Tarea 1.2.

- [ ] **Paso 1:** Reemplazar el paso `Check syntax` por un servicio de Postgres + `npm test`:

```yaml
  validate:
    name: Validate backend
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_USER: test_user
          POSTGRES_PASSWORD: test_pass
          POSTGRES_DB: test_db
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    defaults:
      run:
        working-directory: backend
    env:
      DB_USER: test_user
      DB_PASSWORD: test_pass
      DB_HOST: localhost
      DB_PORT: 5432
      DB_NAME: test_db
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: backend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test
```

(Se elimina el paso `Check syntax` — `npm test` ya ejercita ese código al importar `index.js`, así que un error de sintaxis también hace fallar el job.)

- [ ] **Paso 2:** Verificar el YAML antes de subirlo (evita un ciclo de prueba-error en CI):

```bash
cd "/home/mastero/FullStack- ESP8266_BME280"  # o donde tengas el repo local
python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/deploy.yml'))" 2>/dev/null || node -e "require('js-yaml') && console.log('ver con otra herramienta')"
```
Si no tienes un parser de YAML a mano, simplemente revisa la indentación con cuidado — es el error más común.

- [ ] **Paso 3:** Commit y push; confirmar en la pestaña Actions que `validate` corre los tests reales (no solo `node --check`) y pasan en verde.

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: run real test suite against a Postgres service container"
```

### Tarea 2.2: Smoke test post-deploy

**Por qué:** ahora mismo, si `pm2 restart` deja el backend respondiendo 500 (o caído), el job igual queda en verde. Un smoke test lo detecta al instante.

**Archivos:**
- Modificar: `.github/workflows/deploy.yml` (job `deploy`, después del paso `Restart service (PM2)`)

- [ ] **Paso 1:** Agregar el paso al final del job `deploy`:

```yaml
      - name: Smoke test
        run: |
          for i in $(seq 1 10); do
            code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:7755/api/readings/latest || echo "000")
            if [ "$code" = "200" ]; then
              echo "Smoke test OK (HTTP $code, intento $i)"
              exit 0
            fi
            echo "Intento $i: HTTP $code, reintentando en 2s..."
            sleep 2
          done
          echo "Smoke test FALLO: el backend no respondio 200 tras el restart"
          exit 1
```

- [ ] **Paso 2:** Commit

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add post-deploy smoke test against /api/readings/latest"
```

- [ ] **Paso 3:** Push y confirmar en el log de Actions que aparece "Smoke test OK".

---

## Fase 3 — Validar compilación de firmware en CI

**Por qué:** ahora mismo nadie se entera de un error de compilación en un `.ino` hasta que lo sube a una placa física. Cada carpeta `firmware_*`/`ESP32_Inverter_Monitor` tiene un `config.h.example` ya válido como C++ (con placeholders), así que sirve para compilar en CI sin exponer credenciales reales.

**Archivos:**
- Crear: `.github/workflows/firmware-ci.yml`

**Nota de precisión:** los FQBN de `firmware_display_oled` y `firmware_daly_bms_standalone` están confirmados por las carpetas `build/esp32.esp32.lolin32-lite/` que ya existen en el repo. Los de `firmware_daly_bms_ble` y `ESP32_Inverter_Monitor` son mi mejor estimación (mismo tipo de placa ESP32) — ajústalos si tu placa real es otra; el job fallará con un error claro de FQBN si está mal, no en silencio.

- [ ] **Paso 1:** Crear `.github/workflows/firmware-ci.yml`:

```yaml
name: Firmware Compile Check

on:
  push:
    paths:
      - 'firmware_*/**'
      - 'ESP32_Inverter_Monitor/**'
      - '.github/workflows/firmware-ci.yml'

jobs:
  compile:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        include:
          - path: firmware_BME280
            fqbn: esp8266:esp8266:nodemcuv2
            core: esp8266:esp8266
            core_url: http://arduino.esp8266.com/stable/package_esp8266com_index.json
          - path: firmware_ina226
            fqbn: esp8266:esp8266:nodemcuv2
            core: esp8266:esp8266
            core_url: http://arduino.esp8266.com/stable/package_esp8266com_index.json
          - path: firmware_ina228_solar
            fqbn: esp8266:esp8266:nodemcuv2
            core: esp8266:esp8266
            core_url: http://arduino.esp8266.com/stable/package_esp8266com_index.json
          - path: firmware_display_oled
            fqbn: esp32:esp32:lolin32-lite
            core: esp32:esp32
            core_url: https://espressif.github.io/arduino-esp32/package_esp32_index.json
          - path: firmware_daly_bms_ble
            fqbn: esp32:esp32:lolin32-lite
            core: esp32:esp32
            core_url: https://espressif.github.io/arduino-esp32/package_esp32_index.json
          - path: firmware_daly_bms_standalone
            fqbn: esp32:esp32:lolin32-lite
            core: esp32:esp32
            core_url: https://espressif.github.io/arduino-esp32/package_esp32_index.json
          - path: ESP32_Inverter_Monitor
            fqbn: esp32:esp32:esp32
            core: esp32:esp32
            core_url: https://espressif.github.io/arduino-esp32/package_esp32_index.json
    steps:
      - uses: actions/checkout@v4

      - name: Usar config.h.example como config.h (solo para compilar, no son credenciales reales)
        run: cp "${{ matrix.path }}/config.h.example" "${{ matrix.path }}/config.h"

      - name: Instalar arduino-cli
        uses: arduino/setup-arduino-cli@v1

      - name: Instalar core de placa
        run: |
          arduino-cli config init --overwrite
          arduino-cli config add board_manager.additional_urls "${{ matrix.core_url }}"
          arduino-cli core update-index
          arduino-cli core install "${{ matrix.core }}"

      - name: Instalar librerias
        run: |
          case "${{ matrix.path }}" in
            firmware_BME280)
              arduino-cli lib install "Adafruit Unified Sensor" "Adafruit BME280 Library" "U8g2" "ArduinoJson" "NTPClient"
              ;;
            firmware_ina226)
              arduino-cli lib install "INA226_WE" "ArduinoJson" "NTPClient"
              ;;
            firmware_ina228_solar)
              arduino-cli lib install "INA228" "ArduinoJson" "NTPClient" "ESPAsyncTCP" "ESPAsyncWebServer" "ElegantOTA"
              ;;
            firmware_display_oled)
              arduino-cli lib install "Adafruit GFX Library" "Adafruit SSD1306" "ArduinoJson" "AsyncTCP" "ESPAsyncWebServer" "ElegantOTA"
              ;;
            firmware_daly_bms_ble|firmware_daly_bms_standalone)
              arduino-cli lib install "NimBLE-Arduino" "ArduinoJson" "ESPAsyncWebServer" "ElegantOTA"
              ;;
            ESP32_Inverter_Monitor)
              arduino-cli lib install "ESPAsyncWebServer" "AsyncTCP" "ElegantOTA" "ArduinoJson"
              ;;
          esac

      - name: Compilar ${{ matrix.path }}
        run: arduino-cli compile --fqbn "${{ matrix.fqbn }}" "${{ matrix.path }}"
```

- [ ] **Paso 2:** Commit y push. La primera corrida es la verificación real — si algún nombre de librería no coincide con el índice de Arduino Library Manager, el job falla con un mensaje explícito de "library not found"; corrígelo con `arduino-cli lib search "<nombre aproximado>"` para encontrar el nombre exacto registrado.

```bash
git add .github/workflows/firmware-ci.yml
git commit -m "ci: compile-check every firmware sketch on push"
```

---

## Fase 4 — Métricas Prometheus del backend

**Por qué:** `masteroserver` ya corre Prometheus + Grafana + node-exporter + cAdvisor (contenedores `prometheus`, `grafana-test`, `node-exporter`, `cadvisor` vistos en `docker ps`), pero nada scrapea `bme280-station`. Es la mejora de observabilidad más barata posible dado lo que ya existe.

### Tarea 4.1: Endpoint `/metrics` en el backend

**Archivos:**
- Modificar: `backend/package.json` (nueva dependencia `prom-client`)
- Modificar: `backend/index.js`

- [ ] **Paso 1:** Instalar la dependencia:

```bash
cd backend
npm install prom-client
```

- [ ] **Paso 2:** Justo después de `require('dotenv').config();` en `backend/index.js`, agregar:

```js
const client = require('prom-client');
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duracion de requests HTTP en segundos',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5]
});
register.registerMetric(httpRequestDuration);

const lastReadingAgeSeconds = new client.Gauge({
    name: 'sensor_last_reading_age_seconds',
    help: 'Segundos desde la ultima lectura guardada, por tabla',
    labelNames: ['table']
});
register.registerMetric(lastReadingAgeSeconds);
```

- [ ] **Paso 3:** Justo después de `app.use(bodyParser.json());`, agregar el middleware que mide cada request:

```js
app.use((req, res, next) => {
    const end = httpRequestDuration.startTimer();
    res.on('finish', () => {
        end({ method: req.method, route: req.route ? req.route.path : req.path, status_code: res.statusCode });
    });
    next();
});
```

- [ ] **Paso 4:** Agregar el endpoint `/metrics` (junto a las otras rutas, por ejemplo cerca de `/api/config/bms-pin`):

```js
app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});
```

- [ ] **Paso 5:** Agregar la función que actualiza la edad de la última lectura por tabla, y llamarla periódicamente dentro del guard `if (require.main === module)` (junto al cron de limpieza de la Tarea 1.1):

```js
async function updateReadingAgeMetrics() {
    const tables = ['readings', 'battery_readings', 'solar_readings', 'environment_readings', 'bms_readings', 'inverter_readings'];
    for (const table of tables) {
        try {
            const result = await db.query(`SELECT EXTRACT(EPOCH FROM (NOW() - MAX(created_at))) AS age FROM ${table}`);
            const age = result.rows[0]?.age;
            if (age !== null && age !== undefined) {
                lastReadingAgeSeconds.set({ table }, Number(age));
            }
        } catch (err) {
            console.error(`[METRICS] Error consultando ${table}`, err);
        }
    }
}
```

Y dentro del `if (require.main === module) { ... }`, junto al `setInterval` del cron horario:

```js
    updateReadingAgeMetrics();
    setInterval(updateReadingAgeMetrics, 60000);
```

- [ ] **Paso 6:** Probar localmente:

```bash
cd backend
npm start &
sleep 2
curl -s http://localhost:7755/metrics | head -30
kill %1
```
Esperado: salida en formato Prometheus (`# HELP ...`, `# TYPE ...`, líneas `http_request_duration_seconds_bucket{...}`).

- [ ] **Paso 7:** Commit

```bash
git add backend/package.json backend/package-lock.json backend/index.js
git commit -m "feat: expose Prometheus metrics at /metrics"
```

### Tarea 4.2: Conectar Prometheus al nuevo endpoint (en el servidor, por SSH)

- [ ] **Paso 1:** Localizar el `prometheus.yml` real que usa el contenedor (montado como volumen desde el host):

```bash
docker inspect prometheus --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
```
Busca la línea que termina en `.../prometheus.yml` — edítala en el host, no dentro del contenedor.

- [ ] **Paso 2:** Agregar un nuevo `scrape_config`. **No uses `host.docker.internal`** — es una función de Docker Desktop (Mac/Windows) que no resuelve en Linux nativo por defecto, y fallaría en silencio (target `DOWN` sin error obvio). Usa la IP real del servidor en su red:

```bash
hostname -I
```

```yaml
  - job_name: 'bme280-station'
    static_configs:
      - targets: ['TU_IP_REAL:7755']
```
Si por algún firewall interno esa IP no funcionara, la alternativa es la IP del gateway del bridge de Docker (`ip addr show docker0 | grep inet`, normalmente `172.17.0.1`).

- [ ] **Paso 3:** Recargar Prometheus:

```bash
docker restart prometheus
```

- [ ] **Paso 4:** Confirmar en `http://TU_IP:9090/targets` que `bme280-station` aparece `UP`. Si sale `DOWN`, el mensaje de error ahí mismo indica si es timeout (IP/red) o conexión rechazada (puerto o proceso caído).

---

## Fase 5 — Backups automáticos de PostgreSQL

### Tarea 5.1: Script de backup

**Archivos:**
- Crear: `backend/scripts/backup-db.sh`

- [ ] **Paso 1:** Crear el script:

```bash
#!/usr/bin/env bash
set -euo pipefail

CONTAINER="esp8266_postgres"
BACKUP_DIR="/home/mastero/backups/esp8266_postgres"
RETENTION_DAYS=14
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p "$BACKUP_DIR"

docker exec "$CONTAINER" pg_dump -U "${DB_USER}" "${DB_NAME}" | gzip > "$BACKUP_DIR/backup-$TIMESTAMP.sql.gz"

find "$BACKUP_DIR" -name 'backup-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete

echo "[BACKUP] $(date -Iseconds) OK -> backup-$TIMESTAMP.sql.gz"
```

- [ ] **Paso 2:** Commit

```bash
chmod +x backend/scripts/backup-db.sh
git add backend/scripts/backup-db.sh
git commit -m "chore: add Postgres backup script"
```

### Tarea 5.2: Programarlo en el servidor (por SSH, después de hacer pull del commit anterior)

- [ ] **Paso 1:** Crear la unidad de servicio (reutiliza las credenciales ya presentes en `backend/.env`, sin duplicarlas):

```bash
sudo tee /etc/systemd/system/pg-backup.service > /dev/null <<'EOF'
[Unit]
Description=Backup esp8266_postgres database

[Service]
Type=oneshot
EnvironmentFile=/home/mastero/FullStack- ESP8266_BME280/backend/.env
ExecStart=/bin/bash /home/mastero/FullStack- ESP8266_BME280/backend/scripts/backup-db.sh
EOF
```

- [ ] **Paso 2:** Crear el timer (todos los días a las 3:30 AM):

```bash
sudo tee /etc/systemd/system/pg-backup.timer > /dev/null <<'EOF'
[Unit]
Description=Daily backup of esp8266_postgres

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true

[Install]
WantedBy=timers.target
EOF
```

- [ ] **Paso 3:** Activarlo:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now pg-backup.timer
sudo systemctl start pg-backup.service   # corrida manual para probar ya mismo
ls -la /home/mastero/backups/esp8266_postgres/
```

---

## Fase 6 — Retención de datos (opcional, prioridad baja)

**Contexto:** el tráfico real es bajo (~0.75 req/min visto en `pm2 info`), así que el crecimiento de la base no es urgente. Esta fase es higiene preventiva, no una emergencia — ejecútala solo si ya hiciste las Fases 1–5.

### Tarea 6.1: Job diario de retención

**Archivos:**
- Modificar: `backend/index.js`

- [ ] **Paso 1:** Cerca de la configuración inicial (junto a `const port = ...`), agregar:

```js
const DATA_RETENTION_DAYS = parseInt(process.env.DATA_RETENTION_DAYS || '365', 10);

async function pruneOldReadings() {
    const tables = ['readings', 'battery_readings', 'solar_readings', 'environment_readings', 'bms_readings', 'inverter_readings'];
    for (const table of tables) {
        try {
            const result = await db.query(
                `DELETE FROM ${table} WHERE created_at < NOW() - ($1 || ' days')::interval`,
                [DATA_RETENTION_DAYS]
            );
            if (result.rowCount > 0) {
                console.log(`[RETENCION] ${table}: ${result.rowCount} filas > ${DATA_RETENTION_DAYS} dias eliminadas.`);
            }
        } catch (err) {
            console.error(`[RETENCION ERROR] ${table}`, err);
        }
    }
}
```

- [ ] **Paso 2:** Dentro del `if (require.main === module) { ... }`, agregar:

```js
    setInterval(pruneOldReadings, 24 * 3600000); // 1 vez al dia
```

- [ ] **Paso 3:** Documentar la variable en `backend/.env.example`:

```env
DATA_RETENTION_DAYS=365
```

- [ ] **Paso 4:** Commit

```bash
git add backend/index.js backend/.env.example
git commit -m "feat: add configurable daily data retention job"
```

---

## Autorrevisión

- **Cobertura:** las 4 áreas de "Testing y CI/CD" (npm audit, tests reales, smoke test, CI de firmware) y las 3 de "Observabilidad" (métricas, backups, retención) elegidas están cubiertas, una fase cada una.
- **Sin placeholders:** todo el código de cada tarea es real y aplicable directamente sobre los archivos actuales del repo (verificado releyendo `index.js`, `db.js` y `package.json` antes de escribir el plan).
- **Consistencia:** `app`/`server` exportados en la Tarea 1.1 son exactamente lo que consumen los tests de la Tarea 1.2 y lo que sigue arrancando en producción sin cambios.
- **Riesgo más alto del plan:** los nombres de librerías Arduino en la Fase 3 son mi mejor estimación a partir de los `#include` reales — la primera corrida del workflow es la validación definitiva.
