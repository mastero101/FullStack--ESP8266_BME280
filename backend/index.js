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

// Ruta para Modo Quiosco
app.get('/kiosk', (req, res) => {
    res.sendFile(__dirname + '/public/kiosk.html');
});

// Socket.io Connection
io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id);
    socket.on('disconnect', () => {
        console.log('Cliente desconectado');
    });
});

// POST route to receive data from ESP8266
app.post('/api/readings', async (req, res) => {
    const { temperature, humidity, pressure, heat_index, timestamp } = req.body;

    if (temperature === undefined || humidity === undefined || pressure === undefined) {
        return res.status(400).json({ error: "Missing data" });
    }

    // --- VALIDACIÓN DE DATOS ANÓMALOS ---
    // Filtramos lecturas fuera de rango físico normal, nulos o No-Números (NaN)
    if (
        temperature === null || Number.isNaN(Number(temperature)) ||
        temperature > 65 || temperature < -25 ||
        humidity > 100 || humidity < 0 ||
        pressure < 800 || pressure > 1200
    ) {
        console.warn(`[VALIDACIÓN] Datos rechazados por anomalía o formato: T:${temperature}°C, H:${humidity}%, P:${pressure}hPa`);
        return res.status(422).json({ error: "Anomalous or invalid data rejected" });
    }

    try {
        let finalTimestamp = timestamp;
        if (!finalTimestamp || finalTimestamp < 1000000000) {
            finalTimestamp = Math.floor(Date.now() / 1000);
        }

        // Cálculo del Punto de Rocío (Dew Point) si no viene en el body
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

        // Emitír el nuevo dato por Socket.io para actualización instantánea
        io.emit('newReading', newReading);
        console.log('>>> Nuevo dato emitido:', newReading.temperature, '°C');

        res.status(201).json(newReading);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// GET route to fetch readings with optional filters and downsampling
app.get('/api/readings', async (req, res) => {
    try {
        const { startDate, endDate, limit, downsample } = req.query;
        let queryText;
        const params = [];

        if (startDate && endDate) {
            // Si el downsample está activo o el rango es grande (> 3 días aprox), promediamos por hora
            const start = new Date(startDate);
            const end = new Date(endDate);
            const diffDays = (end - start) / (1000 * 60 * 60 * 24);

            if (downsample === 'true' || diffDays > 3) {
                // Promedio por hora para rangos largos (Mantenimiento de performance)
                queryText = `
                    SELECT 
                        date_trunc('hour', created_at) AS created_at,
                        AVG(temperature)::FLOAT as temperature,
                        AVG(humidity)::FLOAT as humidity,
                        AVG(pressure)::FLOAT as pressure,
                        AVG(heat_index)::FLOAT as heat_index,
                        AVG(dew_point)::FLOAT as dew_point
                    FROM readings
                    WHERE created_at BETWEEN $1 AND $2
                    GROUP BY 1
                    ORDER BY 1 DESC
                `;
            } else {
                queryText = 'SELECT * FROM readings WHERE created_at BETWEEN $1 AND $2 ORDER BY created_at DESC';
            }
            params.push(start, end);
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

// GET route for the latest reading
app.get('/api/readings/latest', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM readings ORDER BY created_at DESC LIMIT 1');
        res.json(result.rows[0] || {});
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// GET route for statistics
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
                MIN(dew_point) as min_dp, MAX(dew_point) as max_dp, AVG(dew_point) as avg_dp,
                (SELECT created_at FROM readings WHERE temperature = (SELECT MIN(temperature) FROM readings) LIMIT 1) as min_temp_at,
                (SELECT created_at FROM readings WHERE temperature = (SELECT MAX(temperature) FROM readings) LIMIT 1) as max_temp_at,
                (SELECT created_at FROM readings WHERE humidity = (SELECT MIN(humidity) FROM readings) LIMIT 1) as min_hum_at,
                (SELECT created_at FROM readings WHERE humidity = (SELECT MAX(humidity) FROM readings) LIMIT 1) as max_hum_at
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
                MIN(dew_point) as min_dp, MAX(dew_point) as max_dp, AVG(dew_point) as avg_dp,
                (SELECT created_at FROM readings WHERE temperature = (SELECT MIN(temperature) FROM readings WHERE created_at >= NOW() - INTERVAL '24 hours') AND created_at >= NOW() - INTERVAL '24 hours' LIMIT 1) as min_temp_at,
                (SELECT created_at FROM readings WHERE temperature = (SELECT MAX(temperature) FROM readings WHERE created_at >= NOW() - INTERVAL '24 hours') AND created_at >= NOW() - INTERVAL '24 hours' LIMIT 1) as max_temp_at,
                (SELECT created_at FROM readings WHERE humidity = (SELECT MIN(humidity) FROM readings WHERE created_at >= NOW() - INTERVAL '24 hours') AND created_at >= NOW() - INTERVAL '24 hours' LIMIT 1) as min_hum_at,
                (SELECT created_at FROM readings WHERE humidity = (SELECT MAX(humidity) FROM readings WHERE created_at >= NOW() - INTERVAL '24 hours') AND created_at >= NOW() - INTERVAL '24 hours' LIMIT 1) as max_hum_at
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
                    MIN(dew_point) as min_dp, MAX(dew_point) as max_dp, AVG(dew_point) as avg_dp,
                    (SELECT created_at FROM readings WHERE temperature = (SELECT MIN(temperature) FROM readings WHERE created_at BETWEEN $1 AND $2) AND created_at BETWEEN $1 AND $2 LIMIT 1) as min_temp_at,
                    (SELECT created_at FROM readings WHERE temperature = (SELECT MAX(temperature) FROM readings WHERE created_at BETWEEN $1 AND $2) AND created_at BETWEEN $1 AND $2 LIMIT 1) as max_temp_at,
                    (SELECT created_at FROM readings WHERE humidity = (SELECT MIN(humidity) FROM readings WHERE created_at BETWEEN $1 AND $2) AND created_at BETWEEN $1 AND $2 LIMIT 1) as min_hum_at,
                    (SELECT created_at FROM readings WHERE humidity = (SELECT MAX(humidity) FROM readings WHERE created_at BETWEEN $1 AND $2) AND created_at BETWEEN $1 AND $2 LIMIT 1) as max_hum_at
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

server.listen(port, () => {
    console.log(`Backend running on http://localhost:${port}`);
});

// Tarea Automática de Limpieza de Datos Anomalos (Cada hora)
setInterval(async () => {
    try {
        const queryText = "DELETE FROM readings WHERE temperature > 65 OR temperature < -25 OR pressure < 800 OR pressure > 1200";
        const result = await db.query(queryText);
        if (result.rowCount > 0) {
            console.log(`[LIMPIEZA] Se eliminaron ${result.rowCount} registros anomalos de la base de datos.`);
        }
    } catch (err) {
        console.error("[LIMPIEZA ERROR]", err);
    }
}, 3600000); // 1 Hora

