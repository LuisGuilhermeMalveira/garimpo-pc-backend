'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { auth } = require('./middleware/auth');
const { pool } = require('./db/pool');

const cidadesRoutes = require('./routes/cidades');
const pecasRoutes = require('./routes/pecas');
const precosBaseRoutes = require('./routes/precosBase');
const modificadoresRoutes = require('./routes/modificadores');
const prospeccoesRoutes = require('./routes/prospeccoes');
const configRoutes = require('./routes/config');
const aiRoutes = require('./routes/ai');
const capturasRoutes = require('./routes/capturas');

const app = express();

app.use(cors());
// JSON grande o suficiente p/ imagens em base64 no corpo
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// --- Healthcheck (público, sem auth) ---
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'up', servico: 'garimpo-pc-backend' });
  } catch (err) {
    res.status(503).json({ ok: false, db: 'down', erro: err.message });
  }
});

app.get('/', (req, res) => {
  res.json({
    servico: 'garimpo-pc-backend',
    fase: 2,
    fase_2: ['/prospeccoes/analisar', '/prospeccoes'],
    rotas: ['/health', '/cidades', '/pecas', '/precos-base', '/modificadores', '/prospeccoes', '/ai/comparar', '/ai/config'],
  });
});

// --- Tudo abaixo exige token ---
app.use(auth);

app.use('/cidades', cidadesRoutes);
app.use('/pecas', pecasRoutes);
app.use('/precos-base', precosBaseRoutes);
app.use('/modificadores', modificadoresRoutes);
app.use('/prospeccoes', prospeccoesRoutes);
app.use('/config', configRoutes);
app.use('/ai', aiRoutes);
app.use('/capturas', capturasRoutes);

// --- 404 ---
app.use((req, res) => {
  res.status(404).json({ erro: `Rota não encontrada: ${req.method} ${req.path}` });
});

// --- Handler de erros central ---
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[erro]', err.stack || err.message);
  const status = err.status || 500;
  res.status(status).json({ erro: err.message || 'Erro interno.' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[garimpo-pc-backend] ouvindo na porta ${PORT}`);
  console.log(`[garimpo-pc-backend] AI_PROVIDER=${process.env.AI_PROVIDER || 'anthropic'}`);
});

module.exports = app;
