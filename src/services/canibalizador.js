'use strict';

/**
 * Canibalizador — compara revender o PC MONTADO vs vender PEÇA A PEÇA (F9).
 *
 *   montado      = valor_revenda (já com modificadores e fator de realização)
 *   canibalizado = Σ (preço-base de cada peça reconhecida) × fator_realizacao
 *
 * Vender peça a peça normalmente rende mais (não carrega o "desconto de PC
 * montado"), MAS dá mais trabalho e demora mais. Só destaca se o ganho passar
 * do limiar.
 */

const { CANIBALIZAR_LIMIAR_GANHO } = require('../config/constantes');

/**
 * @param {Object} ctx
 * @param {number} ctx.valor_revenda_montado
 * @param {Array}  ctx.itens - itens reconhecidos (com preco_aplicado)
 * @param {number} ctx.fator_realizacao
 * @returns {Object}
 */
function calcular({ valor_revenda_montado, itens = [], fator_realizacao = 0.9 }) {
  const reconhecidos = itens.filter((i) => !i.faltante && i.preco_aplicado != null);
  const bruto = reconhecidos.reduce((acc, i) => acc + Number(i.preco_aplicado || 0), 0);
  const valor_canibalizado = Math.round(bruto * fator_realizacao * 100) / 100;

  const diff = Math.round((valor_canibalizado - valor_revenda_montado) * 100) / 100;
  const vale_a_pena = diff >= CANIBALIZAR_LIMIAR_GANHO;

  let recomendacao;
  if (vale_a_pena) {
    recomendacao = `Canibalizar rende +R$${diff.toFixed(0)} (mais trabalho e mais tempo de venda).`;
  } else if (diff > 0) {
    recomendacao = `Diferença pequena (+R$${diff.toFixed(0)}); montado compensa pela praticidade.`;
  } else {
    recomendacao = 'Montado rende igual ou mais — não vale canibalizar.';
  }

  return {
    montado: Math.round(valor_revenda_montado * 100) / 100,
    valor_canibalizado,
    diff,
    vale_a_pena,
    recomendacao,
  };
}

module.exports = { calcular };
