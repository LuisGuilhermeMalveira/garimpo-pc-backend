'use strict';

require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.warn('[db] DATABASE_URL não definido — defina no .env antes de subir o servidor.');
}

// SSL: Railway exige; Postgres local normalmente não.
// Liga quando DB_SSL=true OU a URL aponta pra host remoto conhecido.
const url = process.env.DATABASE_URL || '';
const sslEnv = (process.env.DB_SSL || '').toLowerCase();
const pareceRemoto = /railway|render|amazonaws|supabase|neon|heroku/i.test(url);
const usarSsl = sslEnv === 'true' || (sslEnv !== 'false' && pareceRemoto);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: usarSsl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('[db] erro inesperado no pool de conexões:', err.message);
});

/**
 * Helper de query com log opcional.
 * @param {string} text - SQL com placeholders $1, $2...
 * @param {Array} [params]
 */
function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
