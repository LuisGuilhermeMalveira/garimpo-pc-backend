'use strict';

/**
 * Modificadores — ajustes % por gatilho (cada um vira argumento de barganha).
 * GET /modificadores · POST /modificadores · PATCH /modificadores/:id
 */

const express = require('express');
const { query } = require('../db/pool');

const router = express.Router();

const SENTIDOS = ['sobe', 'desce'];

// GET /modificadores  (?ativo=true|false)
router.get('/', async (req, res, next) => {
  try {
    const params = [req.userId];
    let where = 'WHERE user_id = $1';
    if (req.query.ativo === 'true' || req.query.ativo === 'false') {
      params.push(req.query.ativo === 'true');
      where += ` AND ativo = $${params.length}`;
    }
    const { rows } = await query(
      `SELECT id, nome, gatilho, sentido, percentual, argumento, ativo
         FROM modificadores ${where}
        ORDER BY sentido, nome`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /modificadores
router.post('/', async (req, res, next) => {
  try {
    const { nome, gatilho, sentido, percentual, argumento, ativo } = req.body || {};
    if (!nome || !gatilho || !sentido || percentual == null) {
      return res.status(400).json({ erro: 'nome, gatilho, sentido e percentual são obrigatórios.' });
    }
    if (!SENTIDOS.includes(sentido)) {
      return res.status(400).json({ erro: `sentido deve ser: ${SENTIDOS.join(' | ')}` });
    }
    const { rows } = await query(
      `INSERT INTO modificadores (user_id, nome, gatilho, sentido, percentual, argumento, ativo)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, true))
       RETURNING id, nome, gatilho, sentido, percentual, argumento, ativo`,
      [req.userId, nome, gatilho, sentido, percentual, argumento ?? null, ativo]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PATCH /modificadores/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (req.body && req.body.sentido && !SENTIDOS.includes(req.body.sentido)) {
      return res.status(400).json({ erro: `sentido deve ser: ${SENTIDOS.join(' | ')}` });
    }
    const campos = ['nome', 'gatilho', 'sentido', 'percentual', 'argumento', 'ativo'];
    const sets = [];
    const vals = [];
    let i = 1;
    for (const c of campos) {
      if (req.body && req.body[c] !== undefined) {
        sets.push(`${c} = $${i++}`);
        vals.push(req.body[c]);
      }
    }
    if (sets.length === 0) return res.status(400).json({ erro: 'Nada para atualizar.' });
    vals.push(id, req.userId);
    const { rows } = await query(
      `UPDATE modificadores SET ${sets.join(', ')}
        WHERE id = $${i++} AND user_id = $${i}
       RETURNING id, nome, gatilho, sentido, percentual, argumento, ativo`,
      vals
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Modificador não encontrado.' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
