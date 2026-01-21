const API_URL = 'http://localhost:7755/api/readings';

async function simulate() {
    console.log("Iniciando simulación de datos...");

    const now = Math.floor(Date.now() / 1000);

    // Generar 24 puntos de datos (uno por cada hora virtual previa)
    for (let i = 24; i >= 0; i--) {
        const timestamp = now - (i * 3600);

        // Valores realistas con un poco de variabilidad
        const temperature = 22 + Math.random() * 5;
        const humidity = 45 + Math.random() * 10;
        const pressure = 1010 + Math.random() * 5;
        const heatIndex = temperature + (Math.random() * 0.5);

        const payload = {
            temperature,
            humidity,
            pressure,
            heat_index: heatIndex,
            timestamp: timestamp * 1000 // A milisegundos
        };

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                console.log(`Enviado: Temp ${temperature.toFixed(1)}°C - Hora T-${i}h`);
            } else {
                console.error(`Error ${response.status}: ${await response.text()}`);
            }
        } catch (err) {
            console.error("Error enviando dato:", err.message);
        }
    }

    console.log("¡Simulación completada! Revisa tu dashboard en http://localhost:7755");
}

simulate();
