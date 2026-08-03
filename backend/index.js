const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require('socket.io');
const db = require('./db');
const client = require('prom-client');
require('dotenv').config();

const app = express();

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
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const port = process.env.PORT || 5000;
const DATA_RETENTION_DAYS = parseInt(process.env.DATA_RETENTION_DAYS || '365', 10);

app.use(cors());
app.use(bodyParser.json());

app.use((req, res, next) => {
    const end = httpRequestDuration.startTimer();
    res.on('finish', () => {
        end({ method: req.method, route: req.route ? req.route.path : req.path, status_code: res.statusCode });
    });
    next();
});

app.use(express.static('public'));

// Configurations API
app.get('/api/config/bms-pin', (req, res) => {
    res.json({ pin: process.env.BMS_PIN || "000000" });
});

app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});

// Initialize Database
db.initDb();

// --- ROUTES ---

// Mode Kiosk
app.get('/kiosk', (req, res) => {
    res.sendFile(__dirname + '/public/kiosk.html');
});

app.get('/kiosk-battery', (req, res) => {
    res.sendFile(__dirname + '/public/kiosk-battery.html');
});

app.get('/kiosk-solar', (req, res) => {
    res.sendFile(__dirname + '/public/kiosk-solar.html');
});

app.get('/inverter', (req, res) => {
    res.sendFile(__dirname + '/public/inverter.html');
});

// --- WEATHER READINGS ---

// GET latest reading
app.get('/api/readings/latest', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM readings ORDER BY created_at DESC LIMIT 1');
        res.json(result.rows[0] || {});
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// GET statistics (Weather)
app.get('/api/readings/stats', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        const globalStatsQuery = `
            SELECT 
                COUNT(*) as count,
                MIN(temperature) as min_temp, MAX(temperature) as max_temp, AVG(temperature) as avg_temp,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY temperature) as med_temp,
                STDDEV(temperature) as std_temp, (MAX(temperature) - MIN(temperature)) as rng_temp,
                MIN(humidity) as min_hum, MAX(humidity) as max_hum, AVG(humidity) as avg_hum,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY humidity) as med_hum,
                STDDEV(humidity) as std_hum, (MAX(humidity) - MIN(humidity)) as rng_hum,
                MIN(pressure) as min_pres, MAX(pressure) as max_pres, AVG(pressure) as avg_pres,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pressure) as med_pres,
                (MAX(pressure) - MIN(pressure)) as rng_pres,
                MIN(heat_index) as min_hi, MAX(heat_index) as max_hi, AVG(heat_index) as avg_hi,
                MIN(dew_point) as min_dp, MAX(dew_point) as max_dp, AVG(dew_point) as avg_dp
            FROM readings
        `;

        const last24hStatsQuery = `
            SELECT 
                COUNT(*) as count,
                MIN(temperature) as min_temp, MAX(temperature) as max_temp, AVG(temperature) as avg_temp,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY temperature) as med_temp,
                STDDEV(temperature) as std_temp, (MAX(temperature) - MIN(temperature)) as rng_temp,
                MIN(humidity) as min_hum, MAX(humidity) as max_hum, AVG(humidity) as avg_hum,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY humidity) as med_hum,
                STDDEV(humidity) as std_hum, (MAX(humidity) - MIN(humidity)) as rng_hum,
                MIN(pressure) as min_pres, MAX(pressure) as max_pres, AVG(pressure) as avg_pres,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pressure) as med_pres,
                (MAX(pressure) - MIN(pressure)) as rng_pres,
                MIN(heat_index) as min_hi, MAX(heat_index) as max_hi, AVG(heat_index) as avg_hi,
                MIN(dew_point) as min_dp, MAX(dew_point) as max_dp, AVG(dew_point) as avg_dp
            FROM readings
            WHERE created_at >= NOW() - INTERVAL '24 hours'
        `;

        let rangeStatsQuery = null;
        let rangeParams = [];
        if (startDate && endDate) {
            rangeStatsQuery = `
                SELECT 
                    COUNT(*) as count,
                    MIN(temperature) as min_temp, MAX(temperature) as max_temp, AVG(temperature) as avg_temp,
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY temperature) as med_temp,
                    STDDEV(temperature) as std_temp, (MAX(temperature) - MIN(temperature)) as rng_temp,
                    MIN(humidity) as min_hum, MAX(humidity) as max_hum, AVG(humidity) as avg_hum,
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY humidity) as med_hum,
                    STDDEV(humidity) as std_hum, (MAX(humidity) - MIN(humidity)) as rng_hum,
                    MIN(pressure) as min_pres, MAX(pressure) as max_pres, AVG(pressure) as avg_pres,
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pressure) as med_pres,
                    (MAX(pressure) - MIN(pressure)) as rng_pres,
                    MIN(heat_index) as min_hi, MAX(heat_index) as max_hi, AVG(heat_index) as avg_hi,
                    MIN(dew_point) as min_dp, MAX(dew_point) as max_dp, AVG(dew_point) as avg_dp
                FROM readings
                WHERE created_at BETWEEN $1 AND $2
            `;
            rangeParams = [new Date(startDate), new Date(endDate)];
        }

        const queries = [
            db.query(globalStatsQuery),
            db.query(last24hStatsQuery)
        ];
        if (rangeStatsQuery) queries.push(db.query(rangeStatsQuery, rangeParams));

        const results = await Promise.all(queries);

        res.json({
            global: results[0].rows[0],
            last24h: results[1].rows[0],
            range: rangeStatsQuery ? results[2].rows[0] : null
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// GET historical readings
app.get('/api/readings', async (req, res) => {
    try {
        const { startDate, endDate, limit } = req.query;
        let queryText;
        const params = [];

        if (startDate && endDate) {
            queryText = 'SELECT * FROM readings WHERE created_at BETWEEN $1 AND $2 ORDER BY created_at DESC';
            params.push(new Date(startDate), new Date(endDate));
        } else {
            queryText = 'SELECT * FROM readings ORDER BY created_at DESC';
            if (limit) {
                params.push(parseInt(limit));
                queryText += ` LIMIT $${params.length}`;
            } else {
                queryText += ' LIMIT 100';
            }
        }

        const result = await db.query(queryText, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// POST new reading
app.post('/api/readings', async (req, res) => {
    const { temperature, humidity, pressure, heat_index, timestamp } = req.body;

    if (temperature === undefined || humidity === undefined || pressure === undefined) {
        return res.status(400).json({ error: "Missing data" });
    }

    if (
        temperature === null || Number.isNaN(Number(temperature)) ||
        temperature > 65 || temperature < -25 ||
        humidity > 100 || humidity < 0 ||
        pressure < 800 || pressure > 1200
    ) {
        console.warn(`[VALIDACIÓN BME280] Datos rechazados: T:${temperature}, H:${humidity}, P:${pressure}`);
        return res.status(422).json({ error: "Anomalous or invalid data" });
    }

    try {
        let finalTimestamp = timestamp;
        if (!finalTimestamp || finalTimestamp < 1000000000) {
            finalTimestamp = Math.floor(Date.now() / 1000);
        }

        let dp = req.body.dew_point;
        if (dp === undefined) {
            const a = 17.625;
            const b = 243.04;
            const alpha = Math.log(humidity / 100) + (a * temperature) / (b + temperature);
            dp = (b * alpha) / (a - alpha);
        }

        const queryText = 'INSERT INTO readings(temperature, humidity, pressure, heat_index, dew_point, timestamp) VALUES($1, $2, $3, $4, $5, $6) RETURNING *';
        const values = [temperature, humidity, pressure, heat_index, dp, finalTimestamp];
        const result = await db.query(queryText, values);
        const newReading = result.rows[0];

        io.emit('newReading', newReading);
        res.status(201).json(newReading);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// --- BATTERY READINGS ---

// GET latest battery reading
app.get('/api/battery/latest', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM battery_readings ORDER BY created_at DESC LIMIT 1');
        res.json(result.rows[0] || {});
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// GET statistics (Battery)
app.get('/api/battery/stats', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const globalStatsQuery = `
            SELECT 
                COUNT(*) as count,
                MIN(voltage) as min_volt, MAX(voltage) as max_volt, AVG(voltage) as avg_volt, 
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY voltage) as med_volt,
                STDDEV(voltage) as std_volt, (MAX(voltage) - MIN(voltage)) as rng_volt,
                MIN(current) as min_curr, MAX(current) as max_curr, AVG(current) as avg_curr,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY current) as med_curr,
                STDDEV(current) as std_curr, (MAX(current) - MIN(current)) as rng_curr,
                MIN(power) as min_pow, MAX(power) as max_pow, AVG(power) as avg_pow,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY power) as med_pow,
                (MAX(power) - MIN(power)) as rng_pow,
                (SELECT created_at FROM battery_readings WHERE voltage = (SELECT MIN(voltage) FROM battery_readings) LIMIT 1) as min_volt_at,
                (SELECT created_at FROM battery_readings WHERE voltage = (SELECT MAX(voltage) FROM battery_readings) LIMIT 1) as max_volt_at,
                (SELECT created_at FROM battery_readings WHERE current = (SELECT MIN(current) FROM battery_readings) LIMIT 1) as min_curr_at,
                (SELECT created_at FROM battery_readings WHERE current = (SELECT MAX(current) FROM battery_readings) LIMIT 1) as max_curr_at,
                SUM(CASE WHEN current > 0 THEN power ELSE 0 END) / 60000.0 as charged_wh,
                SUM(CASE WHEN current < 0 THEN ABS(power) ELSE 0 END) / 60000.0 as discharged_wh,
                (SELECT voltage FROM battery_readings ORDER BY created_at ASC LIMIT 1) as first_volt,
                (SELECT voltage FROM battery_readings ORDER BY created_at DESC LIMIT 1) as last_volt
            FROM battery_readings
        `;

        const last24hStatsQuery = `
            SELECT 
                COUNT(*) as count,
                MIN(voltage) as min_volt, MAX(voltage) as max_volt, AVG(voltage) as avg_volt, 
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY voltage) as med_volt,
                STDDEV(voltage) as std_volt, (MAX(voltage) - MIN(voltage)) as rng_volt,
                MIN(current) as min_curr, MAX(current) as max_curr, AVG(current) as avg_curr,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY current) as med_curr,
                STDDEV(current) as std_curr, (MAX(current) - MIN(current)) as rng_curr,
                MIN(power) as min_pow, MAX(power) as max_pow, AVG(power) as avg_pow,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY power) as med_pow,
                (MAX(power) - MIN(power)) as rng_pow,
                (SELECT created_at FROM battery_readings WHERE voltage = (SELECT MIN(voltage) FROM battery_readings WHERE created_at >= NOW() - INTERVAL '24 hours') AND created_at >= NOW() - INTERVAL '24 hours' LIMIT 1) as min_volt_at,
                (SELECT created_at FROM battery_readings WHERE voltage = (SELECT MAX(voltage) FROM battery_readings WHERE created_at >= NOW() - INTERVAL '24 hours') AND created_at >= NOW() - INTERVAL '24 hours' LIMIT 1) as max_volt_at,
                (SELECT created_at FROM battery_readings WHERE current = (SELECT MIN(current) FROM battery_readings WHERE created_at >= NOW() - INTERVAL '24 hours') AND created_at >= NOW() - INTERVAL '24 hours' LIMIT 1) as min_curr_at,
                (SELECT created_at FROM battery_readings WHERE current = (SELECT MAX(current) FROM battery_readings WHERE created_at >= NOW() - INTERVAL '24 hours') AND created_at >= NOW() - INTERVAL '24 hours' LIMIT 1) as max_curr_at,
                SUM(CASE WHEN current > 0 THEN power ELSE 0 END) / 60000.0 as charged_wh,
                SUM(CASE WHEN current < 0 THEN ABS(power) ELSE 0 END) / 60000.0 as discharged_wh,
                (SELECT voltage FROM battery_readings WHERE created_at >= NOW() - INTERVAL '24 hours' ORDER BY created_at ASC LIMIT 1) as first_volt,
                (SELECT voltage FROM battery_readings WHERE created_at >= NOW() - INTERVAL '24 hours' ORDER BY created_at DESC LIMIT 1) as last_volt
            FROM battery_readings
            WHERE created_at >= NOW() - INTERVAL '24 hours'
        `;

        let rangeStatsQuery = null;
        let rangeParams = [];
        if (startDate && endDate) {
            rangeStatsQuery = `
                SELECT 
                    COUNT(*) as count,
                    MIN(voltage) as min_volt, MAX(voltage) as max_volt, AVG(voltage) as avg_volt, 
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY voltage) as med_volt,
                    STDDEV(voltage) as std_volt, (MAX(voltage) - MIN(voltage)) as rng_volt,
                    MIN(current) as min_curr, MAX(current) as max_curr, AVG(current) as avg_curr,
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY current) as med_curr,
                    STDDEV(current) as std_curr, (MAX(current) - MIN(current)) as rng_curr,
                    MIN(power) as min_pow, MAX(power) as max_pow, AVG(power) as avg_pow,
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY power) as med_pow,
                    (MAX(power) - MIN(power)) as rng_pow,
                    (SELECT created_at FROM battery_readings WHERE voltage = (SELECT MIN(voltage) FROM battery_readings WHERE created_at BETWEEN $1 AND $2) AND created_at BETWEEN $1 AND $2 LIMIT 1) as min_volt_at,
                    (SELECT created_at FROM battery_readings WHERE voltage = (SELECT MAX(voltage) FROM battery_readings WHERE created_at BETWEEN $1 AND $2) AND created_at BETWEEN $1 AND $2 LIMIT 1) as max_volt_at,
                    (SELECT created_at FROM battery_readings WHERE current = (SELECT MIN(current) FROM battery_readings WHERE created_at BETWEEN $1 AND $2) AND created_at BETWEEN $1 AND $2 LIMIT 1) as min_curr_at,
                    (SELECT created_at FROM battery_readings WHERE current = (SELECT MAX(current) FROM battery_readings WHERE created_at BETWEEN $1 AND $2) AND created_at BETWEEN $1 AND $2 LIMIT 1) as max_curr_at,
                    SUM(CASE WHEN current > 0 THEN power ELSE 0 END) / 60000.0 as charged_wh,
                    SUM(CASE WHEN current < 0 THEN ABS(power) ELSE 0 END) / 60000.0 as discharged_wh,
                    (SELECT voltage FROM battery_readings WHERE created_at BETWEEN $1 AND $2 ORDER BY created_at ASC LIMIT 1) as first_volt,
                    (SELECT voltage FROM battery_readings WHERE created_at BETWEEN $1 AND $2 ORDER BY created_at DESC LIMIT 1) as last_volt
                FROM battery_readings
                WHERE created_at BETWEEN $1 AND $2
            `;
            rangeParams = [new Date(startDate), new Date(endDate)];
        }

        const todayStart = new Date();
        todayStart.setHours(0,0,0,0);
        const todayStatsQuery = `
            SELECT 
                SUM(CASE WHEN current > 0 THEN power ELSE 0 END) / 60000.0 as charged_wh,
                SUM(CASE WHEN current < 0 THEN ABS(power) ELSE 0 END) / 60000.0 as discharged_wh
            FROM battery_readings
            WHERE created_at >= $1
        `;

        const queries = [
            db.query(globalStatsQuery),
            db.query(last24hStatsQuery),
            db.query(todayStatsQuery, [todayStart])
        ];
        if (rangeStatsQuery) queries.push(db.query(rangeStatsQuery, rangeParams));
        
        const results = await Promise.all(queries);

        res.json({
            global: results[0].rows[0],
            last24h: results[1].rows[0],
            today: results[2].rows[0],
            range: rangeStatsQuery ? results[3].rows[0] : null
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// GET estimated State of Health (SoH) del banco de batería
//
// El Daly BMS/bridge ESP32 no reporta capacidad de fábrica ni conteo de
// ciclos (y el firmware no se toca en este proyecto), así que no hay un
// valor de SoH nativo. Se estima por conteo de culombios: se buscan tramos
// de descarga continua en bms_readings donde el SoC cae al menos
// MIN_DELTA_SOC puntos, se integra la corriente (Ah) en ese tramo, y se
// normaliza a "cuántos Ah representaría una descarga del 100%". La mediana
// de esos tramos se compara contra la capacidad nominal (Ah) que el usuario
// configura en Ajustes -> "Capacidad (Ah)" (ratedAh, mismo valor que ya usa
// el cálculo de "Ah Gastados").
function computeSohFromRows(rows, ratedAh) {
    const MIN_DELTA_SOC = 15;      // % de caída de SoC para contar el tramo como válido
    const MIN_DURATION_MIN = 5;    // duración mínima del tramo
    const MAX_GAP_MIN = 15;        // corta el tramo si el bridge estuvo offline más de esto
    const CURRENT_NOISE_A = 0.05;  // corriente por debajo de esto no se considera descarga real

    const samples = [];
    let run = null;

    function closeRun() {
        if (!run || run.rows.length < 2) { run = null; return; }
        const first = run.rows[0];
        const last = run.rows[run.rows.length - 1];
        const socDelta = first.soc - last.soc;
        const durationMin = (new Date(last.created_at) - new Date(first.created_at)) / 60000;

        if (socDelta >= MIN_DELTA_SOC && durationMin >= MIN_DURATION_MIN) {
            let ah = 0;
            for (let i = 1; i < run.rows.length; i++) {
                const a = run.rows[i - 1], b = run.rows[i];
                const dtH = (new Date(b.created_at) - new Date(a.created_at)) / 3600000;
                ah += ((Math.abs(a.current) + Math.abs(b.current)) / 2) * dtH;
            }
            const normalizedFullAh = ah / (socDelta / 100);
            if (isFinite(normalizedFullAh) && normalizedFullAh > 0) {
                samples.push({ normalizedFullAh, socDelta, durationMin, from: first.created_at, to: last.created_at });
            }
        }
        run = null;
    }

    for (const row of rows) {
        const discharging = row.current < -CURRENT_NOISE_A;
        if (!discharging) { closeRun(); continue; }
        if (run) {
            const prev = run.rows[run.rows.length - 1];
            const gapMin = (new Date(row.created_at) - new Date(prev.created_at)) / 60000;
            if (gapMin > MAX_GAP_MIN) { closeRun(); run = { rows: [row] }; }
            else run.rows.push(row);
        } else {
            run = { rows: [row] };
        }
    }
    closeRun();

    if (samples.length === 0) {
        return { soh_percent: null, estimated_full_capacity_ah: null, samples_used: 0, rated_ah: ratedAh };
    }

    const caps = samples.map(s => s.normalizedFullAh).sort((a, b) => a - b);
    const mid = Math.floor(caps.length / 2);
    const median = caps.length % 2 ? caps[mid] : (caps[mid - 1] + caps[mid]) / 2;
    const sohPercent = Math.max(0, Math.min(120, (median / ratedAh) * 100));

    return {
        soh_percent: Math.round(sohPercent * 10) / 10,
        estimated_full_capacity_ah: Math.round(median * 100) / 100,
        samples_used: samples.length,
        rated_ah: ratedAh,
        last_sample_at: samples[samples.length - 1].to
    };
}

app.get('/api/battery/soh', async (req, res) => {
    try {
        const ratedAh = parseFloat(req.query.ratedAh) || 105;
        const days = Math.min(parseInt(req.query.days) || 90, 365);

        // Subconsulta: si la ventana pedida tiene mas de 300k filas, quedarse
        // con las MAS RECIENTES (DESC + LIMIT) y recien ahi ordenar ASC para
        // el algoritmo. Hacer el LIMIT directamente en ASC descartaria las
        // lecturas mas nuevas en vez de las mas viejas.
        const result = await db.query(
            `SELECT * FROM (
                SELECT voltage, current, soc, created_at FROM bms_readings
                WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
                ORDER BY created_at DESC LIMIT 300000
             ) recent ORDER BY created_at ASC`,
            [days]
        );

        res.json(computeSohFromRows(result.rows, ratedAh));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// GET historical battery readings
app.get('/api/battery', async (req, res) => {
    try {
        const { startDate, endDate, limit } = req.query;
        let queryText;
        const params = [];

        if (startDate && endDate) {
            queryText = 'SELECT * FROM battery_readings WHERE created_at BETWEEN $1 AND $2 ORDER BY created_at DESC';
            params.push(new Date(startDate), new Date(endDate));
        } else {
            queryText = 'SELECT * FROM battery_readings ORDER BY created_at DESC';
            if (limit) {
                params.push(parseInt(limit));
                queryText += ` LIMIT $${params.length}`;
            } else {
                queryText += ' LIMIT 100';
            }
        }

        const result = await db.query(queryText, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// POST new battery reading
app.post('/api/battery', async (req, res) => {
    const { voltage, current, power, timestamp } = req.body;

    if (voltage === undefined || current === undefined || power === undefined) {
        return res.status(400).json({ error: "Missing data" });
    }

    try {
        let finalTimestamp = timestamp;
        if (!finalTimestamp || finalTimestamp < 1000000000) {
            finalTimestamp = Math.floor(Date.now() / 1000);
        }

        const queryText = 'INSERT INTO battery_readings(voltage, current, power, timestamp) VALUES($1, $2, $3, $4) RETURNING *';
        const values = [voltage, current, power, finalTimestamp];
        const result = await db.query(queryText, values);
        const newReading = result.rows[0];

        io.emit('newBatteryReading', newReading);
        res.status(201).json(newReading);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// --- SOLAR READINGS (INA228) ---

// GET latest solar reading
app.get('/api/solar/latest', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM solar_readings ORDER BY created_at DESC LIMIT 1');
        res.json(result.rows[0] || {});
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// GET statistics (Solar)
app.get('/api/solar/stats', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const globalStatsQuery = `
            SELECT 
                COUNT(*) as count,
                MIN(voltage) as min_volt, MAX(voltage) as max_volt, AVG(voltage) as avg_volt, 
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY voltage) as med_volt,
                STDDEV(voltage) as std_volt, (MAX(voltage) - MIN(voltage)) as rng_volt,
                MIN(current) as min_curr, MAX(current) as max_curr, AVG(current) as avg_curr,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY current) as med_curr,
                STDDEV(current) as std_curr, (MAX(current) - MIN(current)) as rng_curr,
                MIN(power) as min_pow, MAX(power) as max_pow, AVG(power) as avg_pow,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY power) as med_pow,
                (MAX(power) - MIN(power)) as rng_pow,
                MIN(temperature) as min_temp, MAX(temperature) as max_temp, AVG(temperature) as avg_temp,
                (SELECT created_at FROM solar_readings WHERE voltage = (SELECT MIN(voltage) FROM solar_readings) LIMIT 1) as min_volt_at,
                (SELECT created_at FROM solar_readings WHERE voltage = (SELECT MAX(voltage) FROM solar_readings) LIMIT 1) as max_volt_at,
                (SELECT created_at FROM solar_readings WHERE current = (SELECT MIN(current) FROM solar_readings) LIMIT 1) as min_curr_at,
                (SELECT created_at FROM solar_readings WHERE current = (SELECT MAX(current) FROM solar_readings) LIMIT 1) as max_curr_at
            FROM solar_readings
        `;

        const last24hStatsQuery = `
            SELECT 
                COUNT(*) as count,
                MIN(voltage) as min_volt, MAX(voltage) as max_volt, AVG(voltage) as avg_volt, 
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY voltage) as med_volt,
                STDDEV(voltage) as std_volt, (MAX(voltage) - MIN(voltage)) as rng_volt,
                MIN(current) as min_curr, MAX(current) as max_curr, AVG(current) as avg_curr,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY current) as med_curr,
                STDDEV(current) as std_curr, (MAX(current) - MIN(current)) as rng_curr,
                MIN(power) as min_pow, MAX(power) as max_pow, AVG(power) as avg_pow,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY power) as med_pow,
                (MAX(power) - MIN(power)) as rng_pow,
                MIN(temperature) as min_temp, MAX(temperature) as max_temp, AVG(temperature) as avg_temp,
                (SELECT created_at FROM solar_readings WHERE voltage = (SELECT MIN(voltage) FROM solar_readings WHERE created_at >= NOW() - INTERVAL '24 hours') AND created_at >= NOW() - INTERVAL '24 hours' LIMIT 1) as min_volt_at,
                (SELECT created_at FROM solar_readings WHERE voltage = (SELECT MAX(voltage) FROM solar_readings WHERE created_at >= NOW() - INTERVAL '24 hours') AND created_at >= NOW() - INTERVAL '24 hours' LIMIT 1) as max_volt_at,
                (SELECT created_at FROM solar_readings WHERE current = (SELECT MIN(current) FROM solar_readings WHERE created_at >= NOW() - INTERVAL '24 hours') AND created_at >= NOW() - INTERVAL '24 hours' LIMIT 1) as min_curr_at,
                (SELECT created_at FROM solar_readings WHERE current = (SELECT MAX(current) FROM solar_readings WHERE created_at >= NOW() - INTERVAL '24 hours') AND created_at >= NOW() - INTERVAL '24 hours' LIMIT 1) as max_curr_at
            FROM solar_readings
            WHERE created_at >= NOW() - INTERVAL '24 hours'
        `;

        let rangeStatsQuery = null;
        let rangeParams = [];
        if (startDate && endDate) {
            rangeStatsQuery = `
                SELECT 
                    COUNT(*) as count,
                    MIN(voltage) as min_volt, MAX(voltage) as max_volt, AVG(voltage) as avg_volt, 
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY voltage) as med_volt,
                    STDDEV(voltage) as std_volt, (MAX(voltage) - MIN(voltage)) as rng_volt,
                    MIN(current) as min_curr, MAX(current) as max_curr, AVG(current) as avg_curr,
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY current) as med_curr,
                    STDDEV(current) as std_curr, (MAX(current) - MIN(current)) as rng_curr,
                    MIN(power) as min_pow, MAX(power) as max_pow, AVG(power) as avg_pow,
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY power) as med_pow,
                    (MAX(power) - MIN(power)) as rng_pow,
                    MIN(temperature) as min_temp, MAX(temperature) as max_temp, AVG(temperature) as avg_temp,
                    (SELECT created_at FROM solar_readings WHERE voltage = (SELECT MIN(voltage) FROM solar_readings WHERE created_at BETWEEN $1 AND $2) AND created_at BETWEEN $1 AND $2 LIMIT 1) as min_volt_at,
                    (SELECT created_at FROM solar_readings WHERE voltage = (SELECT MAX(voltage) FROM solar_readings WHERE created_at BETWEEN $1 AND $2) AND created_at BETWEEN $1 AND $2 LIMIT 1) as max_volt_at,
                    (SELECT created_at FROM solar_readings WHERE current = (SELECT MIN(current) FROM solar_readings WHERE created_at BETWEEN $1 AND $2) AND created_at BETWEEN $1 AND $2 LIMIT 1) as min_curr_at,
                    (SELECT created_at FROM solar_readings WHERE current = (SELECT MAX(current) FROM solar_readings WHERE created_at BETWEEN $1 AND $2) AND created_at BETWEEN $1 AND $2 LIMIT 1) as max_curr_at
                FROM solar_readings
                WHERE created_at BETWEEN $1 AND $2
            `;
            rangeParams = [new Date(startDate), new Date(endDate)];
        }

        const queries = [
            db.query(globalStatsQuery),
            db.query(last24hStatsQuery)
        ];
        if (rangeStatsQuery) queries.push(db.query(rangeStatsQuery, rangeParams));

        const results = await Promise.all(queries);

        res.json({
            global: results[0].rows[0],
            last24h: results[1].rows[0],
            range: rangeStatsQuery ? results[2].rows[0] : null
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// GET historical solar readings
app.get('/api/solar', async (req, res) => {
    try {
        const { startDate, endDate, limit } = req.query;
        let queryText;
        const params = [];

        if (startDate && endDate) {
            queryText = 'SELECT * FROM solar_readings WHERE created_at BETWEEN $1 AND $2 ORDER BY created_at DESC';
            params.push(new Date(startDate), new Date(endDate));
        } else {
            queryText = 'SELECT * FROM solar_readings ORDER BY created_at DESC';
            if (limit) {
                params.push(parseInt(limit));
                queryText += ` LIMIT $${params.length}`;
            } else {
                queryText += ' LIMIT 100';
            }
        }

        const result = await db.query(queryText, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// POST new solar reading (INA228 - con temperatura)
app.post('/api/solar', async (req, res) => {
    const { voltage, current, power, temperature, timestamp } = req.body;

    if (voltage === undefined || current === undefined || power === undefined) {
        return res.status(400).json({ error: "Missing data" });
    }

    try {
        let finalTimestamp = timestamp;
        if (!finalTimestamp || finalTimestamp < 1000000000) {
            finalTimestamp = Math.floor(Date.now() / 1000);
        }

        const queryText = 'INSERT INTO solar_readings(voltage, current, power, temperature, timestamp) VALUES($1, $2, $3, $4, $5) RETURNING *';
        const values = [voltage, current, power, temperature || null, finalTimestamp];
        const result = await db.query(queryText, values);
        const newReading = result.rows[0];

        io.emit('newSolarReading', newReading);
        res.status(201).json(newReading);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// --- ENVIRONMENT READINGS (AHT20/BMP280) ---

// GET latest environment reading
app.get('/api/environment/latest', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM environment_readings ORDER BY created_at DESC LIMIT 1');
        res.json(result.rows[0] || {});
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// GET statistics (Environment)
app.get('/api/environment/stats', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let whereClause = "";
        let params = [];
        if (startDate && endDate) {
            whereClause = "WHERE created_at BETWEEN $1 AND $2";
            params = [new Date(startDate), new Date(endDate)];
        }

        const statsQuery = `
            SELECT 
                COUNT(*) as count,
                MIN(temperature) as min_temp, MAX(temperature) as max_temp, AVG(temperature) as avg_temp,
                MIN(humidity) as min_hum, MAX(humidity) as max_hum, AVG(humidity) as avg_hum,
                MIN(pressure) as min_pres, MAX(pressure) as max_pres, AVG(pressure) as avg_pres
            FROM environment_readings ${whereClause}
        `;

        const result = await db.query(statsQuery, params);
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// GET historical environment readings
app.get('/api/environment', async (req, res) => {
    try {
        const { startDate, endDate, limit } = req.query;
        let queryText = 'SELECT * FROM environment_readings';
        const params = [];

        if (startDate && endDate) {
            queryText += ' WHERE created_at BETWEEN $1 AND $2 ORDER BY created_at DESC';
            params.push(new Date(startDate), new Date(endDate));
        } else {
            queryText += ' ORDER BY created_at DESC';
            const queryLimit = limit ? parseInt(limit) : 100;
            params.push(queryLimit);
            queryText += ' LIMIT $1';
        }

        const result = await db.query(queryText, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// POST new environment reading
app.post('/api/environment', async (req, res) => {
    const { temperature, humidity, pressure, heat_index, timestamp } = req.body;

    if (temperature === undefined || humidity === undefined || pressure === undefined) {
        return res.status(400).json({ error: "Missing data" });
    }

    try {
        let finalTimestamp = timestamp;
        if (!finalTimestamp || finalTimestamp < 1000000000) {
            finalTimestamp = Math.floor(Date.now() / 1000);
        }

        let dp = req.body.dew_point;
        if (dp === undefined) {
            const a = 17.625; const b = 243.04;
            const alpha = Math.log(humidity / 100) + (a * temperature) / (b + temperature);
            dp = (b * alpha) / (a - alpha);
        }

        const queryText = 'INSERT INTO environment_readings(temperature, humidity, pressure, heat_index, dew_point, timestamp) VALUES($1, $2, $3, $4, $5, $6) RETURNING *';
        const values = [temperature, humidity, pressure, heat_index, dp, finalTimestamp];
        const result = await db.query(queryText, values);
        const newReading = result.rows[0];

        io.emit('newEnvironmentReading', newReading);
        res.status(201).json(newReading);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// --- DALY BMS BRIDGE ---
let latestBmsData = null;
let lastBmsUpdate = null;
let bmsBridgeIp = null; // Guardar la IP del ESP32 para enviar comandos

// POST /bms — recibe datos del ESP32
app.post('/bms', async (req, res) => {
    const { voltage, current, soc, cell_max_v, cell_min_v, cell_max_num, cell_min_num, temp1, charge_mos, discharge_mos } = req.body;
    
    try {
        // 1. Guardar en tabla específica de BMS
        const queryBms = `
            INSERT INTO bms_readings(voltage, current, soc, cell_max_v, cell_min_v, cell_max_num, cell_min_num, temp1, charge_mos, discharge_mos)
            VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`;
        const valuesBms = [voltage, current, soc, cell_max_v, cell_min_v, cell_max_num, cell_min_num, temp1, charge_mos, discharge_mos];
        await db.query(queryBms, valuesBms);
        
        // 2. PARCHE: Guardar también en battery_readings (sustituyendo al INA226)
        // Convertimos Amperios a mA (como esperaba el INA226) y calculamos Potencia
        const currentMA = current * 1000.0;
        const powerW = voltage * current;
        const queryBattery = `
            INSERT INTO battery_readings(voltage, current, power, timestamp)
            VALUES($1, $2, $3, $4) RETURNING *`;
        const nowSec = Math.floor(Date.now() / 1000);
        const resultBatt = await db.query(queryBattery, [voltage, currentMA, powerW * 1000.0, nowSec]); // power en mW si current esta en mA?
        // Wait, INA226 power en W o mW? 
        // Revisando battery.html: (data.power / 1000.0).toFixed(1) + ' W'
        // El INA226 guarda Power en mW.
        
        latestBmsData = req.body;
        latestBmsData.created_at = new Date().toISOString(); 
        lastBmsUpdate = Date.now();
        bmsBridgeIp = req.ip || req.header('x-forwarded-for') || req.connection.remoteAddress;
        
        // Normalizar IP si es ::ffff:192.168...
        if (bmsBridgeIp.includes(':')) {
            bmsBridgeIp = bmsBridgeIp.split(':').pop();
        }
        
        // Emitir ambos eventos para retrocompatibilidad
        io.emit('newBmsReading', latestBmsData);
        io.emit('newBatteryReading', resultBatt.rows[0]);
        
        res.status(200).json({ status: "ok" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// GET /bms — expuesto para Home Assistant
app.get('/bms', async (req, res) => {
    try {
        if (!latestBmsData) {
            const result = await db.query('SELECT * FROM bms_readings ORDER BY created_at DESC LIMIT 1');
            if (result.rows.length > 0) {
                latestBmsData = result.rows[0];
                lastBmsUpdate = new Date(latestBmsData.created_at).getTime();
            }
        }

        if (!latestBmsData) {
            return res.json({ online: false });
        }

        const diff = (Date.now() - lastBmsUpdate) / 1000;
        const online = diff < 180;

        res.json({
            ...latestBmsData,
            online,
            bridge_ip: bmsBridgeIp
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// POST /api/bms/control — envía comando al ESP32
app.post('/api/bms/control', async (req, res) => {
    const { type, state } = req.body; // type: "charge"|"discharge", state: true|false
    
    if (!bmsBridgeIp) {
        return res.status(404).json({ error: "BMS Bridge no detectado o offline" });
    }

    try {
        const espState = state ? "1" : "0";
        const url = `http://${bmsBridgeIp}/control?type=${type}&state=${espState}`;
        
        console.log(`[BMS CONTROL] Enviando a ESP32 (${url})`);
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        
        if (response.ok) {
            // Actualización Optimista del Estado Local
            if (latestBmsData) {
                if (type === 'charge') latestBmsData.charge_mos = state;
                if (type === 'discharge') latestBmsData.discharge_mos = state;
                
                // Emitir actualización inmediata a todos los clientes conectados
                io.emit('newBmsReading', latestBmsData);
            }
            
            res.json({ status: "ok", message: `MOS ${type} actualizado a ${state}` });
        } else {
            res.status(500).json({ error: "Error en el ESP32" });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "No se pudo contactar con el ESP32 (Timeout)" });
    }
});

// --- INVERTER READINGS (PowMr) ---

// GET latest inverter reading
app.get('/api/inverter/latest', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM inverter_readings ORDER BY created_at DESC LIMIT 1');
        res.json(result.rows[0] || {});
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// GET statistics (Inverter)
app.get('/api/inverter/stats', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const globalStatsQuery = `
            SELECT 
                COUNT(*) as count,
                MIN(pv_w) as min_pv, MAX(pv_w) as max_pv, AVG(pv_w) as avg_pv,
                MIN(out_w) as min_out, MAX(out_w) as max_out, AVG(out_w) as avg_out,
                MIN(ac_v) as min_ac_v, MAX(ac_v) as max_ac_v, AVG(ac_v) as avg_ac_v,
                MIN(batt_v) as min_batt_v, MAX(batt_v) as max_batt_v, AVG(batt_v) as avg_batt_v,
                (AVG(pv_w) * (EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) / 3600)) as pv_wh,
                (AVG(out_w) * (EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) / 3600)) as out_wh
            FROM inverter_readings
        `;

        const last24hStatsQuery = `
            SELECT 
                COUNT(*) as count,
                MIN(pv_w) as min_pv, MAX(pv_w) as max_pv, AVG(pv_w) as avg_pv,
                MIN(pv_v) as min_pv_v, MAX(pv_v) as max_pv_v, AVG(pv_v) as avg_pv_v,
                MIN(out_w) as min_out, MAX(out_w) as max_out, AVG(out_w) as avg_out,
                MIN(ac_v) as min_ac_v, MAX(ac_v) as max_ac_v, AVG(ac_v) as avg_ac_v,
                MIN(batt_v) as min_batt_v, MAX(batt_v) as max_batt_v, AVG(batt_v) as avg_batt_v,
                (AVG(pv_w) * (EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) / 3600)) as pv_wh,
                (AVG(out_w) * (EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) / 3600)) as out_wh
            FROM inverter_readings
            WHERE created_at >= NOW() - INTERVAL '24 hours'
        `;

        const last7dStatsQuery = `
            SELECT 
                COUNT(*) as count,
                MIN(pv_w) as min_pv, MAX(pv_w) as max_pv, AVG(pv_w) as avg_pv,
                MIN(pv_v) as min_pv_v, MAX(pv_v) as max_pv_v, AVG(pv_v) as avg_pv_v,
                MIN(out_w) as min_out, MAX(out_w) as max_out, AVG(out_w) as avg_out,
                MIN(ac_v) as min_ac_v, MAX(ac_v) as max_ac_v, AVG(ac_v) as avg_ac_v,
                MIN(batt_v) as min_batt_v, MAX(batt_v) as max_batt_v, AVG(batt_v) as avg_batt_v,
                (AVG(pv_w) * (EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) / 3600)) as pv_wh,
                (AVG(out_w) * (EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) / 3600)) as out_wh
            FROM inverter_readings
            WHERE created_at >= NOW() - INTERVAL '7 days'
        `;

        const last30dStatsQuery = `
            SELECT 
                COUNT(*) as count,
                MIN(pv_w) as min_pv, MAX(pv_w) as max_pv, AVG(pv_w) as avg_pv,
                MIN(out_w) as min_out, MAX(out_w) as max_out, AVG(out_w) as avg_out,
                MIN(ac_v) as min_ac_v, MAX(ac_v) as max_ac_v, AVG(ac_v) as avg_ac_v,
                MIN(batt_v) as min_batt_v, MAX(batt_v) as max_batt_v, AVG(batt_v) as avg_batt_v,
                (AVG(pv_w) * (EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) / 3600)) as pv_wh,
                (AVG(out_w) * (EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) / 3600)) as out_wh
            FROM inverter_readings
            WHERE created_at >= NOW() - INTERVAL '30 days'
        `;

        let rangeStatsQuery = null;
        let rangeParams = [];
        if (startDate && endDate) {
            rangeStatsQuery = `
                SELECT 
                    COUNT(*) as count,
                    MIN(pv_w) as min_pv, MAX(pv_w) as max_pv, AVG(pv_w) as avg_pv,
                    MIN(pv_v) as min_pv_v, MAX(pv_v) as max_pv_v, AVG(pv_v) as avg_pv_v,
                    MIN(out_w) as min_out, MAX(out_w) as max_out, AVG(out_w) as avg_out,
                    MIN(ac_v) as min_ac_v, MAX(ac_v) as max_ac_v, AVG(ac_v) as avg_ac_v,
                    MIN(batt_v) as min_batt_v, MAX(batt_v) as max_batt_v, AVG(batt_v) as avg_batt_v,
                    (AVG(pv_w) * (EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) / 3600)) as pv_wh,
                    (AVG(out_w) * (EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) / 3600)) as out_wh
                FROM inverter_readings
                WHERE created_at BETWEEN $1 AND $2
            `;
            rangeParams = [new Date(startDate), new Date(endDate)];
        }

        const queries = [
            db.query(globalStatsQuery),
            db.query(last24hStatsQuery),
            db.query(last7dStatsQuery),
            db.query(last30dStatsQuery)
        ];
        if (rangeStatsQuery) queries.push(db.query(rangeStatsQuery, rangeParams));

        const results = await Promise.all(queries);

        res.json({
            global: results[0].rows[0],
            last24h: results[1].rows[0],
            last7d: results[2].rows[0],
            last30d: results[3].rows[0],
            range: rangeStatsQuery ? results[4].rows[0] : null
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// GET historical inverter readings
app.get('/api/inverter', async (req, res) => {
    try {
        const { startDate, endDate, limit } = req.query;
        let queryText = 'SELECT * FROM inverter_readings';
        const params = [];

        if (startDate && endDate) {
            queryText += ' WHERE created_at BETWEEN $1 AND $2 ORDER BY created_at DESC';
            params.push(new Date(startDate), new Date(endDate));
        } else {
            queryText += ' ORDER BY created_at DESC';
            const queryLimit = limit ? parseInt(limit) : 100;
            params.push(queryLimit);
            queryText += ' LIMIT $1';
        }

        const result = await db.query(queryText, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// POST new inverter reading
app.post('/api/inverter', async (req, res) => {
    const { ac_v, ac_f, out_v, out_f, out_va, out_w, load_p, bus_v, batt_v, batt_c, batt_cap, temp, pv_c, pv_v, pv_w, scc_v, batt_d, batt_w, tx_count, rx_count, parse_errors, frames_ok, timestamp } = req.body;

    try {
        const queryText = `
            INSERT INTO inverter_readings(
                ac_v, ac_f, out_v, out_f, out_va, out_w, load_p, bus_v, batt_v, batt_c, batt_cap, temp, pv_c, pv_v, pv_w, scc_v, batt_d, batt_w, tx_count, rx_count, parse_errors, frames_ok, timestamp
            ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23) RETURNING *`;
        
        const finalTimestamp = timestamp || Math.floor(Date.now() / 1000);
        const values = [ac_v, ac_f, out_v, out_f, out_va, out_w, load_p, bus_v, batt_v, batt_c, batt_cap, temp, pv_c, pv_v, pv_w, scc_v, batt_d, batt_w, tx_count || 0, rx_count || 0, parse_errors || 0, frames_ok || 0, finalTimestamp];
        
        const result = await db.query(queryText, values);
        const newReading = result.rows[0];

        io.emit('newInverterReading', newReading);
        res.status(201).json(newReading);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// --- SERVER & SOCKET ---

io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id);
    socket.on('disconnect', () => {
        console.log('Cliente desconectado');
    });
});

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

    updateReadingAgeMetrics();
    setInterval(updateReadingAgeMetrics, 60000);

    setInterval(pruneOldReadings, 24 * 3600000); // 1 vez al dia
}

module.exports = { app, server, computeSohFromRows };
