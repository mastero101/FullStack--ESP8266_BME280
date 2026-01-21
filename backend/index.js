const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const db = require('./db');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Initialize Database
db.initDb();

// POST route to receive data from ESP8266
app.post('/api/readings', async (req, res) => {
    const { temperature, humidity, pressure, heat_index, timestamp } = req.body;

    if (temperature === undefined || humidity === undefined || pressure === undefined) {
        return res.status(400).json({ error: "Missing data" });
    }

    try {
        let finalTimestamp = timestamp;
        // Si el timestamp enviado es muy pequeño (como millis o 0), usar el tiempo del servidor
        if (!finalTimestamp || finalTimestamp < 1000000000) {
            finalTimestamp = Math.floor(Date.now() / 1000);
        }

        const queryText = 'INSERT INTO readings(temperature, humidity, pressure, heat_index, timestamp) VALUES($1, $2, $3, $4, $5) RETURNING *';
        const values = [temperature, humidity, pressure, heat_index, finalTimestamp];
        const result = await db.query(queryText, values);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
    }
});

// GET route to fetch readings with optional filters
app.get('/api/readings', async (req, res) => {
    try {
        const { startDate, endDate, limit } = req.query;
        let queryText = 'SELECT * FROM readings';
        const params = [];

        if (startDate && endDate) {
            queryText += ' WHERE created_at  BETWEEN $1 AND $2';
            params.push(new Date(startDate), new Date(endDate));
        }

        queryText += ' ORDER BY created_at DESC';

        if (limit && !startDate) {
            params.push(parseInt(limit));
            queryText += ` LIMIT $${params.length}`;
        } else if (!startDate) {
            queryText += ' LIMIT 100';
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

app.listen(port, () => {
    console.log(`Backend running on http://localhost:${port}`);
});
