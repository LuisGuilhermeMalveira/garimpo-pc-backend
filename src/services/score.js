'use strict';

/**
 * Score de confiança do anúncio (0-100). Quanto mais omissão/risco, menor.
 * Score baixo TRAVA o veredito em ⚠️ (tratado no avaliador).
 *
 * Penaliza: modelo incerto, peça faltante, peça estimada, sem foto rodando,
 * possível mineração, fonte sem marca.
 */

const { SCORE } = require('../config/constantes');

/**
 * @param {Object} ctx
 * @param {Array} ctx.itens - itens avaliados (com flags faltante/estimado/modelo_incerto)
 * @param {Object} ctx.sinais - sinais do parser
 * @returns {{ valor: number, fatores: string[], trava: boolean }}
 */
function calcular({ itens = [], sinais = {} }) {
  let valor = SCORE.INICIAL;
  const fatores = [];

  const incertos = itens.filter((i) => i.modelo_incerto).length;
  const faltantes = itens.filter((i) => i.faltante).length;
  // estimativa MANUAL (input do Luís) e PISO genérico não punem o score;
  // só a estimativa automática (por peça-parente) conta como omissão.
  const estimados = itens.filter((i) => i.origem === 'estimado' && !i.manual && !i.piso).length;

  if (incertos > 0) {
    valor -= incertos * SCORE.DEDUCAO_MODELO_INCERTO;
    fatores.push(`${incertos} peça(s) com modelo incerto (−${incertos * SCORE.DEDUCAO_MODELO_INCERTO})`);
  }
  if (faltantes > 0) {
    valor -= faltantes * SCORE.DEDUCAO_FALTANTE;
    fatores.push(`${faltantes} peça(s) sem preço-base (−${faltantes * SCORE.DEDUCAO_FALTANTE})`);
  }
  if (estimados > 0) {
    valor -= estimados * SCORE.DEDUCAO_ESTIMADO;
    fatores.push(`${estimados} peça(s) estimada(s) por similar (−${estimados * SCORE.DEDUCAO_ESTIMADO})`);
  }
  if (sinais.falta_foto_rodando) {
    valor -= SCORE.DEDUCAO_SEM_FOTO_RODANDO;
    fatores.push(`sem foto/vídeo rodando (−${SCORE.DEDUCAO_SEM_FOTO_RODANDO})`);
  }
  if (sinais.possivel_mineracao) {
    valor -= SCORE.DEDUCAO_POSSIVEL_MINERACAO;
    fatores.push(`possível mineração (−${SCORE.DEDUCAO_POSSIVEL_MINERACAO})`);
  }
  if (sinais.fonte_sem_marca) {
    valor -= SCORE.DEDUCAO_FONTE_SEM_MARCA;
    fatores.push(`fonte sem marca (−${SCORE.DEDUCAO_FONTE_SEM_MARCA})`);
  }

  valor = Math.max(0, Math.min(100, Math.round(valor)));
  return { valor, fatores, trava: valor < SCORE.LIMIAR_TRAVA };
}

module.exports = { calcular };
