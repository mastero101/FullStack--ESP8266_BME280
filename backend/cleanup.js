const db = require('./db');

/**
 * Script de Limpieza Manual de Datos Anómalos
 * Ejecutar con: node cleanup.js
 */
async function cleanData() {
    try {
        console.log("--- INICIANDO LIMPIEZA MANUAL ---");

        // Buscamos registros que estén fuera de los rangos físicos normales
        const checkQuery = "SELECT id, temperature, humidity, pressure, created_at FROM readings WHERE temperature > 65 OR temperature < -25 OR pressure < 800 OR pressure > 1200";
        const result = await db.query(checkQuery);

        console.log(`Registros anómalos encontrados: ${result.rows.length}`);

        if (result.rows.length > 0) {
            console.log("Detalle de registros a eliminar:");
            result.rows.forEach(r => {
                console.log(`ID: ${r.id} | Temp: ${r.temperature}°C | Pres: ${r.pressure}hPa | Fecha: ${r.created_at}`);
            });

            const deleteQuery = "DELETE FROM readings WHERE temperature > 65 OR temperature < -25 OR pressure < 800 OR pressure > 1200";
            const deleteResult = await db.query(deleteQuery);
            console.log(`\n>>> ÉXITO: Se eliminaron ${deleteResult.rowCount} registros correctamente.`);
        } else {
            console.log("No se encontraron datos que requieran limpieza.");
        }

        process.exit(0);
    } catch (err) {
        console.error("ERROR durante la limpieza:", err);
        process.exit(1);
    }
}

cleanData();
