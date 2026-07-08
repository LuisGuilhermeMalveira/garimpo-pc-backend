'use strict';

/**
 * Negociador — os 3 preços + a munição de barganha (PRODUTO.md "Os três preços").
 *
 *   1. Preço pedido  — o que o vendedor quer.
 *   2. Preço-teto    — máximo que você pode pagar mantendo o piso de lucro.
 *   3. Preço-oferta  — onde abrir a negociação (abaixo do teto), com munição.
 *
 * Dedução do teto (a partir de lucro = piso):
 *   lucro = valor_revenda − preco − custo_aq − custo_rec − margem_risco_pct·preco
 *   piso  = valor_revenda − custo_aq − custo_rec − preco·(1 + margem_risco_pct)
 *   preco_teto = (valor_revenda − custo_aq − custo_rec − piso) / (1 + margem_risco_pct)
 */

const { FATOR_OFERTA } = require('../config/constantes');

function arred10(n) {
  return Math.max(0, Math.round(n / 10) * 10);
}

/**
 * @param {Object} ctx
 * @param {number} ctx.valor_revenda
 * @param {number} ctx.custo_aquisicao
 * @param {number} ctx.custo_recuperacao
 * @param {number} ctx.margem_risco_pct
 * @param {number} ctx.piso_lucro
 * @param {number} ctx.preco_pedido
 * @param {Array}  ctx.aplicados - modificadores aplicados (munição)
 * @param {Object} ctx.sinais
 * @param {Array}  ctx.itens - itens avaliados (removíveis / incertos)
 * @returns {Object}
 */
function calcular({
  valor_revenda,
  custo_aquisicao = 0,
  custo_recuperacao = 0,
  margem_risco_pct = 0.05,
  piso_lucro = 250,
  preco_pedido = 0,
  aplicados = [],
  sinais = {},
  itens = [],
}) {
  const tetoBruto =
    (valor_revenda - custo_aquisicao - custo_recuperacao - piso_lucro) / (1 + margem_risco_pct);
  const preco_teto = arred10(tetoBruto);

  // abre a oferta abaixo do teto; nunca acima do pedido
  let preco_oferta = arred10(preco_teto * FATOR_OFERTA);
  if (preco_pedido > 0) preco_oferta = Math.min(preco_oferta, arred10(preco_pedido * 0.92));
  if (preco_oferta > preco_teto) preco_oferta = preco_teto;

  // ---- munição ----
  const argumentos = [];
  for (const m of aplicados) {
    if (m.sentido === 'desce' && m.argumento) argumentos.push(m.argumento);
  }
  if (sinais.possivel_mineracao) argumentos.push('Pergunte se a placa foi usada em mineração.');
  if (sinais.falta_foto_rodando) argumentos.push('Sem foto/vídeo rodando — peça prova de funcionamento.');
  for (const i of itens) {
    if (i.modelo_incerto) {
      argumentos.push(`Modelo de "${i.modelo_extraido}" não confirmado — confirme o modelo exato.`);
    }
  }

  const removiveis = itens
    .filter((i) => i.removivel)
    .map((i) => ({ modelo_extraido: i.modelo_extraido, preco_aplicado: i.preco_aplicado || 0 }));

  return {
    preco_pedido: preco_pedido || null,
    preco_teto,
    preco_oferta,
    argumentos: [...new Set(argumentos)],
    removiveis,
  };
}

module.exports = { calcular };
