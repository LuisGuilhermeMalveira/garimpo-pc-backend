'use strict';

/**
 * Fingerprint pra dedup de anúncios (PRODUTO/BANCO.md).
 * Sem link confiável (veio de print), a identidade do PC é hash de
 * título + preço + cidade + specs principais. Mesma fingerprint = mesmo PC.
 *
 * Link, quando existe, é o dedup prioritário (feito fora daqui).
 */

const crypto = require('crypto');
const { normalizar } = require('./texto');

/**
 * Gera a fingerprint a partir dos dados leves do anúncio.
 * @param {Object} dados
 * @param {string} [dados.titulo]
 * @param {number} [dados.preco_pedido]
 * @param {string} [dados.cidade]
 * @param {string[]} [dados.specs] - peças principais (ex.: ['rtx 3060 ti','ryzen 5 5600'])
 * @returns {string} hash hex curto
 */
function fingerprint({ titulo, preco_pedido, cidade, specs } = {}) {
  const partes = [
    normalizar(titulo),
    preco_pedido != null ? String(Math.round(Number(preco_pedido))) : '',
    normalizar(cidade),
    (specs || []).map(normalizar).filter(Boolean).sort().join('|'),
  ];
  const base = partes.join('::');
  return crypto.createHash('sha1').update(base).digest('hex').slice(0, 16);
}

module.exports = { fingerprint };
