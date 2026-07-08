'use strict';

/**
 * Casamento de uma peça extraída contra o catálogo do usuário.
 *
 * - Unitárias (ram/ssd/hd): casa por categoria + capacidade (módulo/faixa).
 *   Determinístico — não há ambiguidade de modelo.
 * - Inteiras (gpu/cpu/mobo/fonte/cooler/gabinete): casa por nome, usando os
 *   NÚMEROS do hardware como discriminador (3060 ≠ 3070; 5600 ≠ 5600G evita-se
 *   por sobreposição de tokens). Retorna o melhor candidato acima do limiar.
 */

const { tokens, numeros } = require('./texto');

const LIMIAR = 0.34; // jaccard mínimo p/ aceitar um casamento de inteira

// marcadores de variante que mudam a peça: "RTX 3060" ≠ "RTX 3060 Ti".
// Se um lado tem o marcador e o outro não, NÃO casa.
const VARIANTES = new Set(['ti', 'super', 'xt', 'xtx', 'gre', 'kf', 'ks', 'x3d']);

// palavras de CATEGORIA que não discriminam a peça — ignoradas no casamento,
// pra "Placa-mãe B550" casar com "B550" (e vice-versa).
const STOPWORDS = new Set(['placa', 'mae', 'memoria', 'fonte', 'processador', 'modulo']);

function semStop(toks) {
  const t = toks.filter((x) => !STOPWORDS.has(x));
  return t.length ? t : toks; // se sobrar nada, mantém o original
}

function inter(a, b) {
  const sb = new Set(b);
  return a.filter((x) => sb.has(x));
}
function uniq(a) {
  return [...new Set(a)];
}
function subconjunto(a, b) {
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}

/** Score de similaridade entre dois nomes de peça inteira (0..1). */
function scoreNome(modeloExtraido, nomeCatalogo) {
  const pNums = numeros(modeloExtraido);
  const cNums = numeros(nomeCatalogo);
  // todo número do modelo extraído precisa existir no candidato (3060 tem que estar lá)
  for (const n of pNums) {
    if (!cNums.includes(n)) return 0;
  }
  const pTok = semStop(uniq(tokens(modeloExtraido)));
  const cTok = semStop(uniq(tokens(nomeCatalogo)));
  if (pTok.length === 0) return 0;

  // guarda de variante: os marcadores (ti/super/xt...) têm que bater dos dois lados
  const pVar = pTok.filter((t) => VARIANTES.has(t)).sort().join(',');
  const cVar = cTok.filter((t) => VARIANTES.has(t)).sort().join(',');
  if (pVar !== cVar) return 0;

  // contenção: o nome curto do catálogo cabe inteiro no modelo do anúncio
  // ("B550" ⊆ "Maxsun B550 Terminator") -> casamento forte
  if (subconjunto(cTok, pTok)) return 0.9;

  const i = inter(pTok, cTok).length;
  const u = uniq([...pTok, ...cTok]).length;
  return u === 0 ? 0 : i / u; // jaccard
}

/**
 * Casa um item (já decomposto) contra o catálogo.
 * @param {Object} item - { categoria, modelo_extraido, tipo, capacidade }
 * @param {Array} catalogo - linhas de peças (com categoria, nome, tipo, capacidade, ...)
 * @returns {{ peca: Object|null, score: number }}
 */
function casar(item, catalogo) {
  const mesmaCat = catalogo.filter((p) => p.categoria === item.categoria);

  if (item.tipo === 'unitaria') {
    const candidatos = mesmaCat.filter(
      (p) => p.tipo === 'unitaria' && Number(p.capacidade) === Number(item.capacidade)
    );
    // havendo mais de uma, prefere a que JÁ tem preço calibrado
    const peca =
      candidatos.find((p) => p.preco_mediana != null) || candidatos[0] || null;
    return { peca, score: peca ? 1 : 0 };
  }

  // inteira: melhor candidato por nome
  let melhor = null;
  let melhorScore = 0;
  for (const p of mesmaCat) {
    const s = scoreNome(item.modelo_extraido, p.nome);
    if (s > melhorScore) {
      melhorScore = s;
      melhor = p;
    }
  }
  if (melhor && melhorScore >= LIMIAR) return { peca: melhor, score: melhorScore };
  return { peca: null, score: melhorScore };
}

module.exports = { casar, scoreNome, LIMIAR };
