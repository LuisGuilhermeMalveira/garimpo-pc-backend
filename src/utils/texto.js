'use strict';

/**
 * Normalização de texto pra casamento de peças e cidades.
 * Hardware tem nome bagunçado ("RTX 3060 Ti 8GB", "rtx3060ti") — normalizar
 * antes de comparar é o que faz o casamento com o banco funcionar.
 */

/** minúsculas, sem acento, sem pontuação, espaços colapsados. */
function normalizar(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // tira acentos
    .replace(/[^a-z0-9]+/g, ' ') // tudo que não é alfanumérico vira espaço
    .trim()
    .replace(/\s+/g, ' ');
}

/** tokens significativos (>=2 chars ou números). */
function tokens(s) {
  return normalizar(s)
    .split(' ')
    .filter((t) => t.length >= 2 || /\d/.test(t));
}

/** só os tokens numéricos (3060, 5600, 8, 650...) — discriminam hardware. */
function numeros(s) {
  return (normalizar(s).match(/\d+/g) || []);
}

module.exports = { normalizar, tokens, numeros };
