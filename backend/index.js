const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require('socket.io');
const db = require('./db');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const port = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

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
        console.warn(`[VALIDACIÓN] Datos rechazados: T:${temperature}, H:${humidity}, P:${pressure}`);
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

// --- SOLAR READINGS ---

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

// POST new solar reading
app.post('/api/solar', async (req, res) => {
    const { voltage, current, power, timestamp } = req.body;

    if (voltage === undefined || current === undefined || power === undefined) {
        return res.status(400).json({ error: "Missing data" });
    }

    try {
        let finalTimestamp = timestamp;
        if (!finalTimestamp || finalTimestamp < 1000000000) {
            finalTimestamp = Math.floor(Date.now() / 1000);
        }

        const queryText = 'INSERT INTO solar_readings(voltage, current, power, timestamp) VALUES($1, $2, $3, $4) RETURNING *';
        const values = [voltage, current, power, finalTimestamp];
        const result = await db.query(queryText, values);
        const newReading = result.rows[0];

        io.emit('newSolarReading', newReading);
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
