const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const initDb = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS readings (
      id SERIAL PRIMARY KEY,
      temperature FLOAT NOT NULL,
      humidity FLOAT NOT NULL,
      pressure FLOAT NOT NULL,
      heat_index FLOAT NOT NULL,
      dew_point FLOAT, 
      timestamp BIGINT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    -- Agregar columna dew_point si no existe
    DO $$ 
    BEGIN 
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='readings' AND column_name='dew_point') THEN
        ALTER TABLE readings ADD COLUMN dew_point FLOAT;
      END IF;
    END $$;

    -- Actualizar registros antiguos con el cálculo del punto de rocío (Fórmula de Magnus)
    UPDATE readings SET dew_point = (243.04 * (ln(humidity/100) + ((17.625 * temperature) / (243.04 + temperature))) / (17.625 - (ln(humidity/100) + ((17.625 * temperature) / (243.04 + temperature)))))
    WHERE dew_point IS NULL;

    CREATE TABLE IF NOT EXISTS battery_readings (
      id SERIAL PRIMARY KEY,
      voltage FLOAT NOT NULL,
      current FLOAT NOT NULL,
      power FLOAT NOT NULL,
      timestamp BIGINT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS solar_readings (
      id SERIAL PRIMARY KEY,
      voltage FLOAT NOT NULL,
      current FLOAT NOT NULL,
      power FLOAT NOT NULL,
      timestamp BIGINT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(queryText);
    console.log("Database table initialized");
  } catch (err) {
    console.error("Error initializing database", err);
  }
};

module.exports = {
  query: (text, params) => pool.query(text, params),
  initDb
};
