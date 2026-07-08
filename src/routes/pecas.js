'use strict';

/**
 * Peças (catálogo) + preço-base mais recente + frescor + tendência.
 *
 * GET    /pecas                 (?categoria=  ?frescor=  ?tipo=)
 * POST   /pecas
 * PATCH  /pecas/:id
 * GET    /pecas/:id/historico   (calibrações = tendência)
 */

const express = require('express');
const { query } = require('../db/pool');
const { classificarFrescor, calcularTendencia } = require('../services/frescor');

const router = express.Router();

const CATEGORIAS = ['gpu', 'cpu', 'mobo', 'ram', 'fonte', 'ssd', 'hd', 'cooler', 'gabinete'];
const LIQUIDEZ = ['alta', 'media', 'baixa'];
const TIPOS = ['inteira', 'unitaria'];
const FRESCOR_VALIDOS = ['fresco', 'recente', 'envelhecendo', 'defasado', 'sem_dados'];

// monta o objeto de peça enriquecido (frescor + tendência) a partir da linha
function enriquecer(row) {
  const dias =
    row.dias_desde_calibracao == null ? null : Number(row.dias_desde_calibracao);
  const frescor = classificarFrescor(dias);
  const medianasHist = (row.medianas_hist || []).map(Number);
  const tendencia = calcularTendencia(medianasHist);

  return {
    id: row.id,
    categoria: row.categoria,
    nome: row.nome,
    tipo: row.tipo,
    capacidade: row.capacidade,
    liquidez: row.liquidez,
    dias_venda_estim: row.dias_venda_estim,
    observacao: row.observacao,
    preco_base: row.preco_mediana == null
      ? null
      : {
          preco_min: Number(row.preco_min),
          preco_mediana: Number(row.preco_mediana),
          preco_max: Number(row.preco_max),
          amostras: Number(row.amostras),
          fonte:
            Number(row.total_calibracoes) > 1
              ? `${row.total_calibracoes} calibrações (peso por data)`
              : 'print de busca',
          data_calibracao: row.data_calibracao,
        },
    frescor,
    tendencia,
    total_calibracoes: Number(row.total_calibracoes) || 0,
  };
}

// GET /pecas
router.get('/', async (req, res, next) => {
  try {
    const params = [req.userId];
    const conds = ['p.user_id = $1'];
    if (req.query.categoria) {
      params.push(req.query.categoria);
      conds.push(`p.categoria = $${params.length}`);
    }
    if (req.query.tipo) {
      params.push(req.query.tipo);
      conds.push(`p.tipo = $${params.length}`);
    }

    const { rows } = await query(
      `SELECT p.id, p.categoria, p.nome, p.tipo, p.capacidade, p.liquidez,
              p.dias_venda_estim, p.observacao,
              pe.preco_min, pe.preco_mediana, pe.preco_max, pe.amostras,
              pe.data_calibracao,
              (CURRENT_DATE - pe.data_calibracao::date) AS dias_desde_calibracao,
              pe.total_calibracoes,
              (SELECT array_agg(preco_mediana ORDER BY data_calibracao)
                 FROM precos_base WHERE peca_id = p.id) AS medianas_hist
         FROM pecas p
         LEFT JOIN precos_efetivos pe ON pe.peca_id = p.id
        WHERE ${conds.join(' AND ')}
        ORDER BY p.categoria, p.nome`,
      params
    );

    let lista = rows.map(enriquecer);

    // filtro por frescor é derivado -> aplica em memória
    const f = req.query.frescor;
    if (f && FRESCOR_VALIDOS.includes(f)) {
      lista = lista.filter((p) => p.frescor.nivel === f);
    }

    res.json(lista);
  } catch (err) {
    next(err);
  }
});

// POST /pecas
router.post('/', async (req, res, next) => {
  try {
    const { categoria, nome, tipo, capacidade, liquidez, dias_venda_estim, observacao } =
      req.body || {};
    if (!categoria || !nome) {
      return res.status(400).json({ erro: 'categoria e nome são obrigatórios.' });
    }
    if (!CATEGORIAS.includes(categoria)) {
      return res.status(400).json({ erro: `categoria inválida. Use: ${CATEGORIAS.join(', ')}` });
    }
    if (tipo && !TIPOS.includes(tipo)) {
      return res.status(400).json({ erro: `tipo inválido. Use: ${TIPOS.join(', ')}` });
    }
    if (liquidez && !LIQUIDEZ.includes(liquidez)) {
      return res.status(400).json({ erro: `liquidez inválida. Use: ${LIQUIDEZ.join(', ')}` });
    }
    const { rows } = await query(
      `INSERT INTO pecas (user_id, categoria, nome, tipo, capacidade, liquidez, dias_venda_estim, observacao)
       VALUES ($1, $2, $3, COALESCE($4,'inteira')::tipo_peca, $5, COALESCE($6,'media')::nivel_liquidez, $7, $8)
       RETURNING id, categoria, nome, tipo, capacidade, liquidez, dias_venda_estim, observacao, criado_em`,
      [
        req.userId,
        categoria,
        nome,
        tipo,
        capacidade ?? null,
        liquidez,
        dias_venda_estim ?? null,
        observacao ?? null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ erro: 'Já existe uma peça com essa categoria e nome.' });
    }
    next(err);
  }
});

// PATCH /pecas/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (req.body && req.body.categoria && !CATEGORIAS.includes(req.body.categoria)) {
      return res.status(400).json({ erro: `categoria inválida. Use: ${CATEGORIAS.join(', ')}` });
    }
    if (req.body && req.body.tipo && !TIPOS.includes(req.body.tipo)) {
      return res.status(400).json({ erro: `tipo inválido. Use: ${TIPOS.join(', ')}` });
    }
    if (req.body && req.body.liquidez && !LIQUIDEZ.includes(req.body.liquidez)) {
      return res.status(400).json({ erro: `liquidez inválida. Use: ${LIQUIDEZ.join(', ')}` });
    }
    const campos = [
      'categoria',
      'nome',
      'tipo',
      'capacidade',
      'liquidez',
      'dias_venda_estim',
      'observacao',
    ];
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
      `UPDATE pecas SET ${sets.join(', ')}
        WHERE id = $${i++} AND user_id = $${i}
       RETURNING id, categoria, nome, tipo, capacidade, liquidez, dias_venda_estim, observacao, criado_em`,
      vals
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Peça não encontrada.' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ erro: 'Já existe uma peça com essa categoria e nome.' });
    }
    next(err);
  }
});

// DELETE /pecas/:id  — exclui a peça (preços-base caem em cascata)
router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rowCount } = await query('DELETE FROM pecas WHERE id = $1 AND user_id = $2', [
      id,
      req.userId,
    ]);
    if (rowCount === 0) return res.status(404).json({ erro: 'Peça não encontrada.' });
    res.json({ ok: true, id });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({
        erro: 'Essa peça está em prospecções salvas — apague a prospecção antes de excluir a peça.',
      });
    }
    next(err);
  }
});

// GET /pecas/:id/historico  — calibrações cronológicas (tendência)
router.get('/:id/historico', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    // confere se a peça é do usuário
    const peca = await query('SELECT id, nome FROM pecas WHERE id = $1 AND user_id = $2', [
      id,
      req.userId,
    ]);
    if (peca.rows.length === 0) return res.status(404).json({ erro: 'Peça não encontrada.' });

    const { rows } = await query(
      `SELECT id, preco_min, preco_mediana, preco_max, amostras, fonte, data_calibracao,
              (CURRENT_DATE - data_calibracao::date) AS dias
         FROM precos_base
        WHERE peca_id = $1
        ORDER BY data_calibracao DESC`,
      [id]
    );

    const calibracoes = rows.map((r) => ({
      ...r,
      frescor: classificarFrescor(r.dias == null ? null : Number(r.dias)),
    }));

    // tendência usa ordem cronológica (mais antiga -> mais nova)
    const medianasCron = [...rows]
      .map((r) => Number(r.preco_mediana))
      .reverse();
    const tendencia = calcularTendencia(medianasCron);

    res.json({ peca_id: id, peca: peca.rows[0].nome, tendencia, calibracoes });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
