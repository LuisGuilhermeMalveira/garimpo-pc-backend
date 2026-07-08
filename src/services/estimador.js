'use strict';

/**
 * Estimador por peça-parente (PRODUTO.md "Similaridade / estimativa").
 *
 * Quando falta o preço exato de uma peça INTEIRA, tenta estimar a partir de
 * uma peça-parente JÁ CALIBRADA na mesma categoria. Regras inegociáveis:
 *   - NUNCA fator fixo (ex.: Ti = normal×1.25) — envelhece e engana.
 *     Usa o preço do parente direto, com confiança rebaixada.
 *   - Marca `origem='estimado'`, sobe a margem de risco, alerta amarelo.
 *   - GPU/CPU nunca é automático: estima só pra não travar e SEMPRE deixa
 *     o veredito preso em ⚠️ (a trava da GPU estimada é tratada no avaliador).
 *   - mobo: equivalente por chipset (mesma categoria já basta aqui).
 *
 * Estimativa só pra NÃO TRAVAR a leitura — nunca pra decidir compra sozinha.
 */

const { numeros, tokens } = require('../utils/texto');

// categorias onde a estimativa automática é proibida pra decidir (mas serve de referência)
const NUNCA_AUTOMATICO = ['gpu', 'cpu'];

/**
 * Acha a melhor peça-parente calibrada na mesma categoria.
 * Heurística simples: mesma categoria, com preço calibrado, e maior
 * sobreposição de tokens/números com o modelo procurado.
 *
 * @param {Object} item - { categoria, modelo_extraido }
 * @param {Array} catalogoComPreco - peças da mesma base que TÊM preco_mediana
 * @returns {{ peca: Object, confianca: 'baixa', motivo: string }|null}
 */
function estimar(item, catalogoComPreco) {
  const candidatos = catalogoComPreco.filter(
    (p) => p.categoria === item.categoria && p.preco_mediana != null
  );
  if (candidatos.length === 0) return null;

  const pTok = new Set(tokens(item.modelo_extraido));
  const pNum = new Set(numeros(item.modelo_extraido));

  let melhor = null;
  let melhorScore = -1;
  for (const c of candidatos) {
    const cTok = tokens(c.nome);
    const cNum = numeros(c.nome);
    let s = 0;
    for (const t of cTok) if (pTok.has(t)) s += 1;
    for (const n of cNum) if (pNum.has(n)) s += 2; // número casando vale mais
    if (s > melhorScore) {
      melhorScore = s;
      melhor = c;
    }
  }
  if (!melhor) return null;

  return {
    peca: melhor,
    confianca: 'baixa',
    motivo: `Estimado a partir de "${melhor.nome}" (parente em ${item.categoria}). Calibre pra cravar.`,
  };
}

function ehTravaDeEstimativa(categoria) {
  return NUNCA_AUTOMATICO.includes(categoria);
}

module.exports = { estimar, ehTravaDeEstimativa, NUNCA_AUTOMATICO };
