'use strict';

/**
 * Runner de migrations — SQL puro, numeradas, idempotente.
 *
 * - Lê todos os arquivos .sql de src/db/migrations em ordem alfabética
 *   (use prefixo numérico: 001_, 002_, ...).
 * - Aplica os que ainda não constam na tabela de controle `_migrations`.
 * - Cada migration roda dentro de uma transação; falhou, dá rollback e aborta.
 *
 * Uso: npm run migrate
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function garantirTabelaControle(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          SERIAL PRIMARY KEY,
      nome        TEXT UNIQUE NOT NULL,
      aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function jaAplicadas(client) {
  const { rows } = await client.query('SELECT nome FROM _migrations ORDER BY nome');
  return new Set(rows.map((r) => r.nome));
}

function listarMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.toLowerCase().endsWith('.sql'))
    .sort();
}

async function run() {
  const client = await pool.connect();
  try {
    await garantirTabelaControle(client);
    const aplicadas = await jaAplicadas(client);
    const arquivos = listarMigrations();

    if (arquivos.length === 0) {
      console.log('[migrate] nenhum arquivo .sql em', MIGRATIONS_DIR);
      return;
    }

    let pendentes = 0;
    for (const nome of arquivos) {
      if (aplicadas.has(nome)) {
        console.log(`[migrate] já aplicada: ${nome}`);
        continue;
      }
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, nome), 'utf8');
      console.log(`[migrate] aplicando: ${nome} ...`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO _migrations (nome) VALUES ($1)', [nome]);
        await client.query('COMMIT');
        console.log(`[migrate] OK: ${nome}`);
        pendentes += 1;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[migrate] FALHOU em ${nome}: ${err.message}`);
        throw err;
      }
    }

    console.log(
      pendentes === 0
        ? '[migrate] banco já estava atualizado.'
        : `[migrate] concluído — ${pendentes} migration(s) aplicada(s).`
    );
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('[migrate] erro fatal:', err.message);
  process.exit(1);
});
