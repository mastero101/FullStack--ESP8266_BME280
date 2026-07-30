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
    // heat_index es obligatorio a nivel de esquema (NOT NULL) aunque la
    // validacion del endpoint no lo exija -- todo firmware real lo envia.
    await request(app).post('/api/readings').send({
        temperature: 30, humidity: 40, pressure: 1005, heat_index: 31.2
    });
    const res = await request(app).get('/api/readings/latest');
    assert.equal(res.status, 200);
    assert.equal(res.body.temperature, 30);
});
