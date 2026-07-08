'use strict';

/**
 * Calibrador — lê um print de busca via camada de IA e devolve a faixa de
 * preço-base (min/mediana/max) descartando outliers ±35%.
 *
 * NÃO grava nada: segue o fluxo do produto "IA lê → Luís confirma/ajusta →
 * grava". A persistência fica no route POST /precos-base.
 */

const ai = require('../ai');
const { calcularFaixa } = require('../utils/mediana');
const { bufferParaTiles } = require('../utils/imagem');

/**
 * @param {Object} opts
 * @param {{base64:string, mimetype:string}} [opts.imagem] - print de busca
 * @param {string} [opts.texto] - alternativa: lista de preços em texto
 * @param {number} [opts.tolerancia=0.35]
 * @returns {Promise<{
 *   precos_lidos: number[],
 *   observacoes: string,
 *   faixa: object,            // saída de calcularFaixa()
 *   provider: string
 * }>}
 */
async function calibrar({ imagem, texto, tolerancia, nome_peca, provider } = {}) {
  if (!imagem && texto == null) {
    throw new Error('calibrar: forneça imagem (print) ou texto.');
  }

  const providerNome = provider || ai.resolverNomeProvider('calibrador');
  const contexto = nome_peca
    ? `A peça avulsa sendo calibrada é: "${nome_peca}". Conte só anúncios dessa peça vendida sozinha.`
    : null;

  let precosLidos = [];
  let observacoes = '';
  let tiles = 1;
  let truncado = false;

  if (imagem && imagem.buffer) {
    // print pode ser longo -> fatia em tiles legíveis e junta os preços
    const fatias = await bufferParaTiles(imagem.buffer);
    tiles = fatias.tiles.length;
    truncado = fatias.truncado;
    for (const tile of fatias.tiles) {
      const ex = await ai.executarTarefa({ tarefa: 'calibrador', imagem: tile, contexto, providerNome });
      if (Array.isArray(ex && ex.precos)) precosLidos.push(...ex.precos);
      if (ex && ex.observacoes) observacoes += (observacoes ? ' · ' : '') + ex.observacoes;
    }
  } else {
    // imagem só-base64 (sem buffer) ou texto
    const ex = await ai.executarTarefa({ tarefa: 'calibrador', imagem, texto, contexto, providerNome });
    precosLidos = Array.isArray(ex && ex.precos) ? ex.precos : [];
    observacoes = (ex && ex.observacoes) || '';
  }

  if (truncado) {
    observacoes += (observacoes ? ' · ' : '') + 'Print muito longo: li só a parte inicial. Pra calibrar tudo, use prints menores.';
  }

  const faixa = calcularFaixa(precosLidos, tolerancia);

  return {
    precos_lidos: precosLidos,
    observacoes,
    faixa,
    provider: providerNome,
    tiles,
  };
}

module.exports = { calibrar };
