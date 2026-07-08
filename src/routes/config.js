'use strict';

/**
 * Config de negócio do usuário (a "régua" do veredito).
 * Mora na tabela `usuarios`. São os parâmetros que o Luís ajusta sem mexer
 * em código: fator de realização, margem de risco, piso de lucro, custo/km.
 *
 * GET /config · PATCH /config
 */

const express = require('express');
const { query } = require('../db/pool');

const router = express.Router();

// categorias válidas pra piso (gpu pode ser null = sem piso)
const CATEGORIAS_PISO = [
  'cpu',
  'gpu',
  'mobo',
  'ram',
  'fonte',
  'ssd',
  'hd',
  'cooler',
  'gabinete',
  'monitor',
  'periferico',
  'outro',
];

// limites sãos pra cada parâmetro (evita config que quebra o modelo)
const LIMITES = {
  fator_realizacao: [0.5, 1.0],
  margem_risco_pct: [0.0, 0.5],
  piso_lucro: [0, 100000],
  custo_km: [0, 100],
};

function dentro(campo, v) {
  const [min, max] = LIMITES[campo];
  return Number.isFinite(v) && v >= min && v <= max;
}

// GET /config
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT nome, email, fator_realizacao, piso_lucro, margem_risco_pct, custo_km, pisos
         FROM usuarios WHERE id = $1`,
      [req.userId]
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    const u = rows[0];
    res.json({
      nome: u.nome,
      email: u.email,
      fator_realizacao: Number(u.fator_realizacao),
      piso_lucro: Number(u.piso_lucro),
      margem_risco_pct: Number(u.margem_risco_pct),
      custo_km: Number(u.custo_km),
      pisos: u.pisos || {},
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /config
router.patch('/', async (req, res, next) => {
  try {
    const campos = ['fator_realizacao', 'piso_lucro', 'margem_risco_pct', 'custo_km'];
    const sets = [];
    const vals = [];
    let i = 1;
    for (const c of campos) {
      if (req.body && req.body[c] !== undefined) {
        const v = Number(req.body[c]);
        if (!dentro(c, v)) {
          return res
            .status(400)
            .json({ erro: `${c} fora do intervalo permitido (${LIMITES[c][0]}–${LIMITES[c][1]}).` });
        }
        sets.push(`${c} = $${i++}`);
        vals.push(v);
      }
    }
    // pisos por categoria (merge com os existentes)
    if (req.body && req.body.pisos && typeof req.body.pisos === 'object') {
      const limpos = {};
      for (const [k, v] of Object.entries(req.body.pisos)) {
        if (!CATEGORIAS_PISO.includes(k)) continue;
        if (v === null || v === '') {
          limpos[k] = null;
          continue;
        }
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0 || n > 100000) {
          return res.status(400).json({ erro: `piso de "${k}" inválido (0–100000 ou vazio).` });
        }
        limpos[k] = n;
      }
      const cur = await query('SELECT pisos FROM usuarios WHERE id = $1', [req.userId]);
      const atual = (cur.rows[0] && cur.rows[0].pisos) || {};
      const merged = { ...atual, ...limpos };
      sets.push(`pisos = $${i++}::jsonb`);
      vals.push(JSON.stringify(merged));
    }

    if (sets.length === 0) return res.status(400).json({ erro: 'Nada para atualizar.' });
    vals.push(req.userId);
    const { rows } = await query(
      `UPDATE usuarios SET ${sets.join(', ')}
        WHERE id = $${i}
       RETURNING fator_realizacao, piso_lucro, margem_risco_pct, custo_km, pisos`,
      vals
    );
    const u = rows[0];
    res.json({
      fator_realizacao: Number(u.fator_realizacao),
      piso_lucro: Number(u.piso_lucro),
      margem_risco_pct: Number(u.margem_risco_pct),
      custo_km: Number(u.custo_km),
      pisos: u.pisos || {},
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
