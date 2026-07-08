'use strict';

/**
 * Cidades-fonte (config de combustível por distância).
 * GET /cidades · POST /cidades · PATCH /cidades/:id · DELETE /cidades/:id
 *
 * Combustível (custo_aquisicao): se o Luís não digitar o valor, o app calcula
 * km_ida_volta × custo_km (do config do usuário) e arredonda pra real cheio.
 * Assim "pega o km e vira desconto" sem precisar fazer a conta na mão.
 */

const express = require('express');
const { query } = require('../db/pool');

const router = express.Router();

// custo de combustível derivado do km, usando o custo_km do usuário.
async function custoPorKm(userId, km) {
  const { rows } = await query('SELECT custo_km FROM usuarios WHERE id = $1', [userId]);
  const ckm = rows[0] ? Number(rows[0].custo_km) : 0;
  return Math.round((Number(km) || 0) * ckm);
}

// GET /cidades
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, nome, km_ida_volta, custo_aquisicao, criado_em
         FROM cidades
        WHERE user_id = $1
        ORDER BY km_ida_volta, nome`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /cidades
router.post('/', async (req, res, next) => {
  try {
    const { nome, km_ida_volta } = req.body || {};
    let { custo_aquisicao } = req.body || {};
    if (!nome || km_ida_volta == null) {
      return res.status(400).json({ erro: 'nome e km_ida_volta são obrigatórios.' });
    }
    // sem valor digitado -> calcula pelo km
    if (custo_aquisicao == null || custo_aquisicao === '') {
      custo_aquisicao = await custoPorKm(req.userId, km_ida_volta);
    }
    const { rows } = await query(
      `INSERT INTO cidades (user_id, nome, km_ida_volta, custo_aquisicao)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nome, km_ida_volta, custo_aquisicao, criado_em`,
      [req.userId, nome, km_ida_volta, custo_aquisicao]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PATCH /cidades/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const body = req.body || {};

    // se mudou o km mas não mandou custo, recalcula o combustível pelo km novo
    if (body.km_ida_volta != null && (body.custo_aquisicao == null || body.custo_aquisicao === '')) {
      body.custo_aquisicao = await custoPorKm(req.userId, body.km_ida_volta);
    }

    const campos = ['nome', 'km_ida_volta', 'custo_aquisicao'];
    const sets = [];
    const vals = [];
    let i = 1;
    for (const c of campos) {
      if (body[c] !== undefined) {
        sets.push(`${c} = $${i++}`);
        vals.push(body[c]);
      }
    }
    if (sets.length === 0) {
      return res.status(400).json({ erro: 'Nada para atualizar.' });
    }
    vals.push(id, req.userId);
    const { rows } = await query(
      `UPDATE cidades SET ${sets.join(', ')}
        WHERE id = $${i++} AND user_id = $${i}
       RETURNING id, nome, km_ida_volta, custo_aquisicao, criado_em`,
      vals
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Cidade não encontrada.' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /cidades/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rowCount } = await query(
      'DELETE FROM cidades WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    );
    if (rowCount === 0) return res.status(404).json({ erro: 'Cidade não encontrada.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
