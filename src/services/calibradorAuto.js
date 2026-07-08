'use strict';

/**
 * Calibrador AUTOMÁTICO — recebe print(s) de página de BUSCA e, sem escolher
 * peça antes: a IA identifica cada anúncio avulso (nome canônico + preço),
 * o serviço agrupa por modelo, casa com o catálogo do usuário (matcher) e
 * grava uma calibração (mediana com descarte de outliers) pra cada peça casada.
 *
 * Conservador por princípio:
 *  - só grava com >= MIN_AMOSTRAS preços válidos no grupo;
 *  - grupo sem peça correspondente no banco NÃO cria peça sozinho — vira
 *    "ignorada" com o motivo (descoberta sob demanda: o Luís decide criar);
 *  - dry_run=true faz tudo menos gravar (pra conferir antes).
 */

const ai = require('../ai');
const { query } = require('../db/pool');
const { calcularFaixa } = require('../utils/mediana');
const { bufferParaTiles } = require('../utils/imagem');
const { casar } = require('../utils/matcher');
const { classificarFrescor } = require('./frescor');

const MIN_AMOSTRAS = 2; // mínimo de anúncios pra confiar numa mediana

const CATS_UNITARIA = new Set(['ram', 'ssd', 'hd']);

// capacidade em GB a partir do nome canônico ("SSD 480GB", "HD 1TB", "Memória 8GB DDR4")
function capacidadeDoModelo(modelo) {
  const m = String(modelo).match(/(\d+(?:[.,]\d+)?)\s*(tb|gb)/i);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  return Math.round(m[2].toLowerCase() === 'tb' ? n * 1024 : n);
}

// tokens de marketing que NÃO diferenciam a peça (OC ≠ variante como Ti/Super)
const RUIDO = /\b(oc|gaming|windforce|dual|sc|itx|mini)\b/gi;

function normalizarModelo(modelo) {
  return String(modelo).replace(RUIDO, ' ').replace(/\s+/g, ' ').trim();
}

function chaveGrupo(item) {
  return `${item.categoria}|${normalizarModelo(item.modelo).toLowerCase()}`;
}

async function carregarCatalogo(userId) {
  const { rows } = await query(
    `SELECT p.id, p.categoria, p.nome, p.tipo, p.capacidade,
            pe.preco_mediana
       FROM pecas p
       LEFT JOIN precos_efetivos pe ON pe.peca_id = p.id
      WHERE p.user_id = $1`,
    [userId]
  );
  return rows;
}

async function gravarCalibracao({ peca_id, faixa, fonte }) {
  const { rows } = await query(
    `INSERT INTO precos_base (peca_id, preco_min, preco_mediana, preco_max, amostras, fonte)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, data_calibracao`,
    [peca_id, faixa.preco_min, faixa.preco_mediana, faixa.preco_max, faixa.amostras, fonte]
  );
  return { ...rows[0], frescor: classificarFrescor(0) };
}

/**
 * @param {Object} opts
 * @param {Array<{buffer:Buffer}>} opts.imagens - print(s) de busca
 * @param {number} opts.userId
 * @param {string} [opts.provider] - override anthropic/openai
 * @param {number} [opts.tolerancia] - descarte de outliers (default 0.35)
 * @param {boolean} [opts.dryRun] - true = identifica e casa, mas NÃO grava
 */
async function calibrarAuto({ imagens, userId, provider, tolerancia, dryRun = false }) {
  if (!imagens || !imagens.length) throw new Error('calibrarAuto: envie ao menos um print.');

  const providerNome = provider || ai.resolverNomeProvider('calibrador');

  // 1) IA lê cada print (fatiado se for comprido) e lista {categoria, modelo, preco}
  const itens = [];
  let observacoes = '';
  for (const img of imagens) {
    const fatias = await bufferParaTiles(img.buffer);
    for (const tile of fatias.tiles) {
      const ex = await ai.executarTarefa({ tarefa: 'calibrador_auto', imagem: tile, providerNome });
      if (Array.isArray(ex && ex.itens)) itens.push(...ex.itens);
      if (ex && ex.observacoes) observacoes += (observacoes ? ' · ' : '') + ex.observacoes;
    }
    if (fatias.truncado) {
      observacoes += (observacoes ? ' · ' : '') + 'Print muito longo: li só a parte inicial.';
    }
  }

  // 2) agrupa por peça canônica
  const grupos = new Map();
  for (const it of itens) {
    if (!it || !it.modelo || !(Number(it.preco) > 0)) continue;
    const k = chaveGrupo(it);
    if (!grupos.has(k)) grupos.set(k, { categoria: it.categoria, modelo: normalizarModelo(it.modelo), precos: [] });
    grupos.get(k).precos.push(Number(it.preco));
  }

  // 3) casa cada grupo com o banco e grava mediana
  const catalogo = await carregarCatalogo(userId);
  const calibradas = [];
  const ignoradas = [];

  for (const g of grupos.values()) {
    const tipo = CATS_UNITARIA.has(g.categoria) ? 'unitaria' : 'inteira';
    const item = {
      categoria: g.categoria,
      tipo,
      capacidade: tipo === 'unitaria' ? capacidadeDoModelo(g.modelo) : null,
      modelo_extraido: g.modelo,
    };
    const { peca } = casar(item, catalogo);

    if (g.precos.length < MIN_AMOSTRAS) {
      ignoradas.push({ modelo: g.modelo, categoria: g.categoria, precos: g.precos, motivo: `só ${g.precos.length} anúncio (mínimo ${MIN_AMOSTRAS})` });
      continue;
    }
    const faixa = calcularFaixa(g.precos, tolerancia);
    if (!faixa.ok) {
      ignoradas.push({ modelo: g.modelo, categoria: g.categoria, precos: g.precos, motivo: faixa.aviso || 'faixa inválida' });
      continue;
    }
    if (!peca) {
      ignoradas.push({ modelo: g.modelo, categoria: g.categoria, precos: g.precos, faixa, motivo: 'peça não existe no banco — crie no Catálogo e recalibre' });
      continue;
    }

    let gravacao = null;
    if (!dryRun) {
      gravacao = await gravarCalibracao({ peca_id: peca.id, faixa, fonte: 'auto print' });
    }
    calibradas.push({
      peca_id: peca.id,
      peca: peca.nome,
      modelo_lido: g.modelo,
      preco_anterior: peca.preco_mediana != null ? Number(peca.preco_mediana) : null,
      preco_mediana: faixa.preco_mediana,
      preco_min: faixa.preco_min,
      preco_max: faixa.preco_max,
      amostras: faixa.amostras,
      outliers_descartados: g.precos.length - faixa.amostras,
      gravado: !dryRun,
      data: gravacao ? gravacao.data_calibracao : null,
    });
  }

  return {
    provider: providerNome,
    anuncios_lidos: itens.length,
    calibradas,
    ignoradas,
    observacoes,
    dry_run: !!dryRun,
  };
}

module.exports = { calibrarAuto };
