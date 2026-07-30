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
