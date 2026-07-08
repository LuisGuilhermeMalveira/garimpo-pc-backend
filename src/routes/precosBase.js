'use strict';

/**
 * Preço-base — calibração por IA e persistência (histórico = tendência).
 *
 * POST /precos-base/calibrar  (IA)  — lê print, retorna faixa (NÃO grava)
 * POST /precos-base                 — grava uma calibração (nova linha = nova tendência)
 * POST /precos-base/manual          — grava direto (sem IA); fonte 'manual'
 *
 * O fluxo do produto é: IA lê -> Luís confirma/ajusta -> grava.
 * Por isso /calibrar é só leitura; a gravação é um POST separado.
 */

const express = require('express');
const { query } = require('../db/pool');
const { upload, imagemDoRequest } = require('../middleware/upload');
const { calibrar } = require('../services/calibrador');
const { calcularFaixa } = require('../utils/mediana');
const { classificarFrescor } = require('../services/frescor');
const { uploadImagem, cloudinaryHabilitado } = require('../utils/cloudinary');

const router = express.Router();

// confere se a peça pertence ao usuário
async function pecaDoUsuario(pecaId, userId) {
  const { rows } = await query('SELECT id, nome FROM pecas WHERE id = $1 AND user_id = $2', [
    pecaId,
    userId,
  ]);
  return rows[0] || null;
}

// grava uma linha de preço_base e devolve enriquecida com frescor
async function gravar({ peca_id, preco_min, preco_mediana, preco_max, amostras, fonte }) {
  const { rows } = await query(
    `INSERT INTO precos_base (peca_id, preco_min, preco_mediana, preco_max, amostras, fonte)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, peca_id, preco_min, preco_mediana, preco_max, amostras, fonte, data_calibracao`,
    [peca_id, preco_min, preco_mediana, preco_max, amostras ?? 1, fonte ?? null]
  );
  const r = rows[0];
  return { ...r, frescor: classificarFrescor(0) };
}

/**
 * POST /precos-base/calibrar
 * Entrada: multipart (campo "imagem") OU JSON { imagem_base64 } OU { texto }.
 * Opcionais: peca_id, nome_busca, tolerancia, salvar_print.
 * Saída: preços lidos, faixa (min/mediana/max), outliers descartados. NÃO grava.
 */
router.post('/calibrar', upload.single('imagem'), async (req, res, next) => {
  try {
    const img = imagemDoRequest(req);
    const texto = req.body && req.body.texto;
    if (!img && !texto) {
      return res
        .status(400)
        .json({ erro: 'Envie um print (campo "imagem" / imagem_base64) ou "texto" com os preços.' });
    }

    const tolerancia = req.body && req.body.tolerancia != null ? Number(req.body.tolerancia) : undefined;
    const pecaId = req.body && req.body.peca_id ? Number(req.body.peca_id) : null;

    let peca = null;
    if (pecaId) {
      peca = await pecaDoUsuario(pecaId, req.userId);
      if (!peca) return res.status(404).json({ erro: 'peca_id não encontrado.' });
    }

    const nome_peca = (req.body && req.body.nome_busca) || (peca ? peca.nome : null);
    const provider = ['anthropic', 'openai'].includes(req.body && req.body.provider)
      ? req.body.provider
      : undefined;
    const resultado = await calibrar({ imagem: img, texto, tolerancia, nome_peca, provider });

    // upload opcional do print (não bloqueia o fluxo)
    let imagem_url = null;
    if (img && img.buffer && cloudinaryHabilitado()) {
      imagem_url = await uploadImagem(img.buffer, { folder: 'garimpo-pc/calibracoes' });
    }

    res.json({
      peca_id: pecaId,
      peca: peca ? peca.nome : null,
      nome_busca: (req.body && req.body.nome_busca) || (peca ? peca.nome : null),
      provider: resultado.provider,
      precos_lidos: resultado.precos_lidos,
      observacoes: resultado.observacoes,
      // resumo da faixa pronta pra confirmar/salvar
      faixa: resultado.faixa,
      imagem_url,
      // dica de payload pra confirmar a gravação
      salvar_em: '/precos-base',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /precos-base
 * Grava a calibração confirmada. Pode receber a faixa já pronta
 * (preco_min/mediana/max) OU uma lista "precos" pra recalcular aqui.
 */
router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    const peca_id = Number(b.peca_id);
    if (!peca_id) return res.status(400).json({ erro: 'peca_id é obrigatório.' });
    const peca = await pecaDoUsuario(peca_id, req.userId);
    if (!peca) return res.status(404).json({ erro: 'peca_id não encontrado.' });

    let { preco_min, preco_mediana, preco_max, amostras } = b;

    // se mandou a lista de preços, recalcula a faixa aqui (servidor é a verdade)
    if (Array.isArray(b.precos) && b.precos.length > 0) {
      const faixa = calcularFaixa(b.precos, b.tolerancia != null ? Number(b.tolerancia) : undefined);
      if (!faixa.ok) return res.status(400).json({ erro: faixa.aviso || 'Preços inválidos.' });
      preco_min = faixa.preco_min;
      preco_mediana = faixa.preco_mediana;
      preco_max = faixa.preco_max;
      amostras = faixa.amostras;
    }

    if (preco_min == null || preco_mediana == null || preco_max == null) {
      return res
        .status(400)
        .json({ erro: 'Informe preco_min, preco_mediana e preco_max (ou um array "precos").' });
    }

    const linha = await gravar({
      peca_id,
      preco_min,
      preco_mediana,
      preco_max,
      amostras,
      fonte: b.fonte || 'print busca',
    });
    res.status(201).json(linha);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /precos-base/manual — gravação manual direta (sem IA). fonte 'manual'.
 */
router.post('/manual', async (req, res, next) => {
  try {
    const b = req.body || {};
    const peca_id = Number(b.peca_id);
    if (!peca_id) return res.status(400).json({ erro: 'peca_id é obrigatório.' });
    const peca = await pecaDoUsuario(peca_id, req.userId);
    if (!peca) return res.status(404).json({ erro: 'peca_id não encontrado.' });

    if (b.preco_min == null || b.preco_mediana == null || b.preco_max == null) {
      return res.status(400).json({ erro: 'preco_min, preco_mediana e preco_max são obrigatórios.' });
    }

    const linha = await gravar({
      peca_id,
      preco_min: b.preco_min,
      preco_mediana: b.preco_mediana,
      preco_max: b.preco_max,
      amostras: b.amostras,
      fonte: b.fonte || 'manual',
    });
    res.status(201).json(linha);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
