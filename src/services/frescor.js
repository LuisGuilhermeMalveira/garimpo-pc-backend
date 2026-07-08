'use strict';

/**
 * Frescor e tendência do preço-base (regras do BANCO.md / PRODUTO.md).
 *
 * Frescor (dias desde a calibração mais recente):
 *   0–7   🟢 fresco
 *   8–21  🟡 recente
 *   22–30 🟠 envelhecendo
 *   31+   🔴 defasado (recalibrar)
 */

const NIVEIS = {
  fresco: { nivel: 'fresco', emoji: '🟢', label: 'fresco' },
  recente: { nivel: 'recente', emoji: '🟡', label: 'recente' },
  envelhecendo: { nivel: 'envelhecendo', emoji: '🟠', label: 'envelhecendo' },
  defasado: { nivel: 'defasado', emoji: '🔴', label: 'defasado' },
  sem_dados: { nivel: 'sem_dados', emoji: '⚪', label: 'sem calibração' },
};

/**
 * Classifica frescor a partir do nº de dias (ou null se nunca calibrado).
 * @param {number|null|undefined} dias
 */
function classificarFrescor(dias) {
  if (dias == null || Number.isNaN(dias)) return { dias: null, ...NIVEIS.sem_dados };
  const d = Math.max(0, Math.floor(dias));
  if (d <= 7) return { dias: d, ...NIVEIS.fresco };
  if (d <= 21) return { dias: d, ...NIVEIS.recente };
  if (d <= 30) return { dias: d, ...NIVEIS.envelhecendo };
  return { dias: d, ...NIVEIS.defasado };
}

/**
 * Dias entre uma data de calibração e hoje.
 * @param {Date|string|null} dataCalibracao
 * @returns {number|null}
 */
function diasDesde(dataCalibracao) {
  if (!dataCalibracao) return null;
  const dt = dataCalibracao instanceof Date ? dataCalibracao : new Date(dataCalibracao);
  if (Number.isNaN(dt.getTime())) return null;
  const ms = Date.now() - dt.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/**
 * Tendência a partir do histórico de medianas (mais antiga -> mais nova).
 * Retorna direção + spark textual simples pro front desenhar.
 * @param {number[]} medianasCronologicas
 */
function calcularTendencia(medianasCronologicas) {
  const ms = (medianasCronologicas || []).map(Number).filter((n) => Number.isFinite(n));
  if (ms.length === 0) return { direcao: 'sem_dados', calibracoes: 0, valores: [] };
  if (ms.length === 1) return { direcao: 'unico', calibracoes: 1, valores: ms };

  const primeiro = ms[0];
  const ultimo = ms[ms.length - 1];
  const delta = ultimo - primeiro;
  const variacao = primeiro !== 0 ? delta / primeiro : 0;

  let direcao = 'estavel';
  if (variacao > 0.05) direcao = 'subindo';
  else if (variacao < -0.05) direcao = 'caindo';

  return {
    direcao,
    calibracoes: ms.length,
    valores: ms,
    variacao_pct: Math.round(variacao * 1000) / 10, // ex.: -12.5 (%)
  };
}

module.exports = {
  NIVEIS,
  classificarFrescor,
  diasDesde,
  calcularTendencia,
};
