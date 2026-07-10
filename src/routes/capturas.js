'use strict';

/**
 * Capturas — a extensão sobe o print aqui (SEM IA, rápido) e abre a Triagem
 * com ?captura=ID. A análise só roda quando o Luís toca em Analisar.
 *
 * POST /capturas      — multipart "imagem" + texto/link/origem/titulo -> { id }
 * GET  /capturas/:id  — metadados (sem a imagem; ela fica pro /analisar)
 */

const express = require('express');
const { query } = require('../db/pool');
const { upload, imagemDoRequest } = require('../middleware/upload');

const router = express.Router();

// POST /capturas
router.post('/', upload.single('imagem'), async (req, res, next) => {
  try {
    const img = imagemDoRequest(req);
    if (!img) return res.status(400).json({ erro: 'Envie o print (campo "imagem").' });
    const b = req.body || {};

    // higiene: captura é fila, não acervo — some depois de 2 dias
    await query(`DELETE FROM capturas WHERE user_id = $1 AND criado_em < now() - interval '2 days'`, [req.userId]);

    const origem = ['olx', 'facebook', 'outro'].includes(b.origem) ? b.origem : 'olx';
    const { rows } = await query(
      `INSERT INTO capturas (user_id, imagem_b64, mimetype, texto, link, origem, titulo)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [req.userId, img.base64, img.mimetype || 'image/jpeg', b.texto || null, b.link || null, origem, b.titulo || null]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    next(err);
  }
});

// GET /capturas/:id/imagem — o print em si (miniatura de conferência na Triagem)
router.get('/:id/imagem', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT imagem_b64, mimetype FROM capturas WHERE id = $1 AND user_id = $2',
      [Number(req.params.id), req.userId]
    );
    if (!rows[0]) return res.status(404).json({ erro: 'Captura não encontrada (expirou?).' });
    res.set('Content-Type', rows[0].mimetype || 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(Buffer.from(rows[0].imagem_b64, 'base64'));
  } catch (err) {
    next(err);
  }
});

// GET /capturas/:id — só metadados (a Triagem mostra "print carregado")
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, link, origem, titulo, criado_em, length(imagem_b64) AS tamanho_b64
         FROM capturas WHERE id = $1 AND user_id = $2`,
      [Number(req.params.id), req.userId]
    );
    if (!rows[0]) return res.status(404).json({ erro: 'Captura não encontrada (expirou?). Garimpe de novo.' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
