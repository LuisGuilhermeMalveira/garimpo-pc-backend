'use strict';

/**
 * Pré-processamento de imagem antes de mandar pra IA.
 *
 * Problema: prints de busca da OLX são páginas LONGAS — passam dos 8000px de
 * altura, limite que a API de visão (Anthropic) recusa. Além disso, imagens
 * gigantes são reescaladas pelo provider, perdendo legibilidade dos preços.
 *
 * Solução:
 *   - bufferParaTiles: normaliza a largura e FATIA a vertical em pedaços
 *     legíveis (cada tile vira uma chamada à IA; os preços lidos são unidos).
 *     Ideal pro calibrador (lista de preços).
 *   - bufferUnicoRedimensionado: reduz a imagem pra caber no limite, como UMA
 *     imagem só. Ideal pro parser de anúncio (specs posicionais de 1 PC).
 *
 * Degrada com elegância: se o sharp falhar, devolve o buffer original.
 */

const sharp = require('sharp');

const LARGURA_TRABALHO = 1280; // largura normalizada (mantém legibilidade)
const ALTURA_TILE = 1400; // altura máx de cada fatia
const MAX_TILES = 8; // teto de chamadas por calibração
const LADO_MAX_UNICO = 1568; // long edge p/ imagem única (sweet spot de visão)

function paraImagem(buffer, mimetype) {
  return { base64: buffer.toString('base64'), mimetype: mimetype || 'image/png' };
}

/**
 * Fatia um print longo em tiles legíveis (largura normalizada).
 * @param {Buffer} buffer
 * @returns {Promise<{tiles: Array<{base64,mimetype}>, truncado: boolean}>}
 */
async function bufferParaTiles(buffer) {
  try {
    const meta = await sharp(buffer).metadata();
    const largura = Math.min(meta.width || LARGURA_TRABALHO, LARGURA_TRABALHO);

    // normaliza a largura uma vez; depois recorta tiles dessa base
    const base = await sharp(buffer).resize({ width: largura }).png().toBuffer();
    const metaBase = await sharp(base).metadata();
    const alturaTotal = metaBase.height || 0;

    if (alturaTotal <= ALTURA_TILE) {
      return { tiles: [paraImagem(base, 'image/png')], truncado: false };
    }

    const tiles = [];
    let y = 0;
    while (y < alturaTotal && tiles.length < MAX_TILES) {
      const altura = Math.min(ALTURA_TILE, alturaTotal - y);
      const t = await sharp(base).extract({ left: 0, top: y, width: largura, height: altura }).png().toBuffer();
      tiles.push(paraImagem(t, 'image/png'));
      y += altura;
    }
    const truncado = y < alturaTotal; // estourou o teto de tiles
    return { tiles, truncado };
  } catch (err) {
    console.warn('[imagem] tiling falhou, usando original:', err.message);
    return { tiles: [paraImagem(buffer, 'image/png')], truncado: false };
  }
}

/**
 * Reduz a imagem pra caber no limite, como UMA imagem só.
 * @param {Buffer} buffer
 * @returns {Promise<{base64,mimetype}>}
 */
async function bufferUnicoRedimensionado(buffer) {
  try {
    const meta = await sharp(buffer).metadata();
    const lado = Math.max(meta.width || 0, meta.height || 0);
    if (lado <= LADO_MAX_UNICO) {
      return paraImagem(buffer, meta.format ? `image/${meta.format}` : 'image/png');
    }
    const out = await sharp(buffer)
      .resize({ width: LADO_MAX_UNICO, height: LADO_MAX_UNICO, fit: 'inside' })
      .png()
      .toBuffer();
    return paraImagem(out, 'image/png');
  } catch (err) {
    console.warn('[imagem] resize falhou, usando original:', err.message);
    return paraImagem(buffer, 'image/png');
  }
}

module.exports = {
  bufferParaTiles,
  bufferUnicoRedimensionado,
  LARGURA_TRABALHO,
  ALTURA_TILE,
  MAX_TILES,
};
