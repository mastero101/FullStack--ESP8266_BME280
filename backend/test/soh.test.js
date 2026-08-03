const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { server, computeSohFromRows } = require('../index');

after(() => {
    server.close();
});

function row(current, soc, isoDate) {
    return { current, soc, created_at: new Date(isoDate) };
}

// Genera lecturas cada `stepMin` minutos, con corriente constante y SoC
// interpolado linealmente entre socStart y socEnd -- simula un tramo de
// descarga continua tal como lo postearia el bridge ESP32 en la realidad
// (lecturas frecuentes, no una cada hora).
function dischargeRun(current, socStart, socEnd, startIso, stepMin, count) {
    const rows = [];
    const start = new Date(startIso).getTime();
    for (let i = 0; i < count; i++) {
        const soc = socStart + (socEnd - socStart) * (i / (count - 1));
        rows.push(row(current, soc, new Date(start + i * stepMin * 60000).toISOString()));
    }
    return rows;
}

test('computeSohFromRows: sin tramos de descarga suficientes devuelve null', () => {
    const rows = [
        row(1.0, 90, '2026-01-01T00:00:00Z'),
        row(0.5, 92, '2026-01-01T00:05:00Z'),
        row(-0.02, 91, '2026-01-01T00:10:00Z'), // por debajo del ruido, no cuenta
    ];
    const result = computeSohFromRows(rows, 100);
    assert.equal(result.soh_percent, null);
    assert.equal(result.samples_used, 0);
});

test('computeSohFromRows: un tramo de descarga de 1h a 10A con 20% de caida de SoC estima 50Ah', () => {
    // 5 lecturas cada 15 min (1h total), SoC 80 -> 60
    const rows = dischargeRun(-10, 80, 60, '2026-01-01T00:00:00Z', 15, 5);
    const result = computeSohFromRows(rows, 100);
    assert.equal(result.samples_used, 1);
    // 10A durante 1h = 10Ah; cae 20% de SoC -> 10 / 0.20 = 50Ah
    assert.equal(result.estimated_full_capacity_ah, 50);
    assert.equal(result.soh_percent, 50);
});

test('computeSohFromRows: un hueco largo entre lecturas corta el tramo', () => {
    // Primer tramo: 40 min a intervalos de 5 min, SoC 90 -> 70 (valido: cae 20%)
    const first = dischargeRun(-10, 90, 70, '2026-01-01T00:00:00Z', 5, 9);
    // Hueco de 2h (bridge offline), luego un segundo tramo corto que por si
    // solo no llega al 15% de caida de SoC requerido
    const second = dischargeRun(-10, 68, 66, '2026-01-01T02:40:00Z', 5, 3);
    const result = computeSohFromRows([...first, ...second], 100);
    assert.equal(result.samples_used, 1);
});

test('computeSohFromRows: la mediana de varios tramos ignora un outlier', () => {
    const runA = dischargeRun(-10, 90, 70, '2026-01-01T00:00:00Z', 10, 7);   // ~50Ah
    const runB = dischargeRun(-10, 90, 70, '2026-01-02T00:00:00Z', 10, 7);   // ~50Ah
    const runC = dischargeRun(-1, 90, 70, '2026-01-03T00:00:00Z', 10, 7);    // outlier: ~5Ah
    const result = computeSohFromRows([...runA, ...runB, ...runC], 100);
    assert.equal(result.samples_used, 3);
    assert.equal(result.estimated_full_capacity_ah, 50);
});
