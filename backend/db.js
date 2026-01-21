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
      timestamp BIGINT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
