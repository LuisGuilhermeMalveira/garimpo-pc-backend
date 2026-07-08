'use strict';

/**
 * Camada de IA — teste de provider.
 *
 * POST /ai/comparar (IA) — { tarefa:'parser'|'calibrador'|'lote', imagem|texto }
 *   Roda o MESMO input nos DOIS providers e devolve as saídas lado a lado
 *   + tempo (ms) + erro (se houver). Serve pra escolher provider com dado real.
 *
 * GET  /ai/config — mostra o provider ativo (global + override por tarefa),
 *   pra conferir a configuração sem expor chaves.
 */

const express = require('express');
const { upload, imagemDoRequest } = require('../middleware/upload');
const ai = require('../ai');
const { TAREFAS } = require('../ai/prompts');

const router = express.Router();

const TAREFAS_VALIDAS = Object.keys(TAREFAS); // calibrador | parser | lote

// GET /ai/config
router.get('/config', (req, res) => {
  const config = {
    global: (process.env.AI_PROVIDER || 'anthropic').toLowerCase(),
    por_tarefa: {},
  };
  for (const t of TAREFAS_VALIDAS) {
    config.por_tarefa[t] = ai.resolverNomeProvider(t);
  }
  config.providers_disponiveis = ai.PROVIDERS_VALIDOS;
  res.json(config);
});

// POST /ai/comparar
router.post('/comparar', upload.single('imagem'), async (req, res, next) => {
  try {
    const tarefa = (req.body && req.body.tarefa) || '';
    if (!TAREFAS_VALIDAS.includes(tarefa)) {
      return res
        .status(400)
        .json({ erro: `tarefa inválida. Use: ${TAREFAS_VALIDAS.join(' | ')}` });
    }
    const imagem = imagemDoRequest(req);
    const texto = req.body && req.body.texto;
    if (!imagem && texto == null) {
      return res.status(400).json({ erro: 'Envie "imagem" (print) ou "texto".' });
    }

    const resultado = await ai.compararProviders({ tarefa, imagem, texto });
    res.json(resultado);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
