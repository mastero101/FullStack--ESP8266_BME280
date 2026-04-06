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
      source VARCHAR(50) DEFAULT 'Desconocido',
      timestamp BIGINT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    -- Columnas para diferenciar sensores
    DO $$ 
    BEGIN 
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='readings' AND column_name='dew_point') THEN
        ALTER TABLE readings ADD COLUMN dew_point FLOAT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='readings' AND column_name='source') THEN
        ALTER TABLE readings ADD COLUMN source VARCHAR(50) DEFAULT 'Desconocido';
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
      temperature FLOAT,
      timestamp BIGINT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    -- Migración: agregar columna temperature a solar_readings (INA228)
    DO $$ 
    BEGIN 
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='solar_readings' AND column_name='temperature') THEN
        ALTER TABLE solar_readings ADD COLUMN temperature FLOAT;
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS environment_readings (
      id SERIAL PRIMARY KEY,
      temperature FLOAT NOT NULL,
      humidity FLOAT NOT NULL,
      pressure FLOAT NOT NULL,
      heat_index FLOAT NOT NULL,
      dew_point FLOAT, 
      timestamp BIGINT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bms_readings (
      id SERIAL PRIMARY KEY,
      voltage FLOAT NOT NULL,
      current FLOAT NOT NULL,
      soc FLOAT NOT NULL,
      cell_max_v FLOAT NOT NULL,
      cell_min_v FLOAT NOT NULL,
      cell_max_num INT,
      cell_min_num INT,
      temp1 FLOAT NOT NULL,
      charge_mos BOOLEAN NOT NULL,
      discharge_mos BOOLEAN NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS inverter_readings (
      id SERIAL PRIMARY KEY,
      ac_v FLOAT,
      ac_f FLOAT,
      out_v FLOAT,
      out_f FLOAT,
      out_va INT,
      out_w INT,
      load_p INT,
      bus_v FLOAT,
      batt_v FLOAT,
      batt_c INT,
      batt_cap INT,
      temp FLOAT,
      pv_c INT,
      pv_v FLOAT,
      pv_w INT,
      scc_v FLOAT,
      batt_d INT,
      batt_w INT,
      tx_count INT,
      rx_count INT,
      parse_errors INT,
      frames_ok INT,
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
