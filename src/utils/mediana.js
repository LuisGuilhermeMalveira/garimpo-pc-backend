'use strict';

/**
 * Mediana e descarte de outliers — o coração da calibração.
 *
 * Princípio do projeto: MEDIANA, não média; outliers fora de ±35% da
 * mediana são descartados (preço-base é o PEDIDO típico do mercado, não
 * o teto nem o chamariz).
 *
 * O cálculo é feito em CÓDIGO (não no modelo): o modelo só lê os preços.
 */

const TOLERANCIA_PADRAO = 0.35; // ±35% da mediana

/**
 * Converte um preço em string para número, tratando a notação pt-BR.
 * Regras:
 *   - vírgula presente  -> vírgula é decimal, pontos são milhar  ("1.250,00" -> 1250)
 *   - só ponto(s):
 *       - vários pontos                 -> todos são milhar      ("1.000.000" -> 1000000)
 *       - um ponto seguido de 3 dígitos -> milhar                ("1.300" -> 1300)
 *       - um ponto seguido de 1-2 díg.  -> decimal               ("12.5" -> 12.5)
 * Hardware usado em reais não custa centavos sozinho, então "1.300" = 1300.
 * @param {string} v
 * @returns {number} NaN se não der pra interpretar
 */
function parsePrecoBr(v) {
  let s = String(v).replace(/[^\d.,]/g, '');
  if (!s) return NaN;

  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.'); // 1.250,00 -> 1250.00
    return parseFloat(s);
  }

  const pontos = (s.match(/\./g) || []).length;
  if (pontos === 0) return parseFloat(s);
  if (pontos > 1) return parseFloat(s.replace(/\./g, '')); // 1.000.000 -> 1000000

  // um único ponto: milhar se exatamente 3 dígitos depois dele
  const depois = s.split('.')[1] || '';
  if (depois.length === 3) return parseFloat(s.replace('.', '')); // 1.300 -> 1300
  return parseFloat(s); // 12.5 -> 12.5
}

/** Mediana de um array de números (assume array não-vazio). */
function mediana(nums) {
  const ord = [...nums].sort((a, b) => a - b);
  const meio = Math.floor(ord.length / 2);
  return ord.length % 2 === 0 ? (ord[meio - 1] + ord[meio]) / 2 : ord[meio];
}

/**
 * Normaliza a entrada: aceita números ou strings ("1.250", "R$ 1.250,00"),
 * descarta o que não vira número positivo.
 */
function normalizarPrecos(entrada) {
  if (!Array.isArray(entrada)) return [];
  const out = [];
  for (const v of entrada) {
    let n;
    if (typeof v === 'number') {
      n = v;
    } else if (typeof v === 'string') {
      n = parsePrecoBr(v);
    }
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  return out;
}

/**
 * Calcula a faixa de preço-base descartando outliers ±tolerancia da mediana.
 *
 * @param {Array<number|string>} entrada - preços lidos
 * @param {number} [tolerancia=0.35]
 * @returns {{
 *   ok: boolean,
 *   usados: number[],
 *   descartados: number[],
 *   preco_min: number|null,
 *   preco_mediana: number|null,
 *   preco_max: number|null,
 *   amostras: number,
 *   tolerancia: number,
 *   limite_inferior: number|null,
 *   limite_superior: number|null,
 *   aviso: string|null
 * }}
 */
function calcularFaixa(entrada, tolerancia = TOLERANCIA_PADRAO) {
  const precos = normalizarPrecos(entrada);

  const vazio = {
    ok: false,
    usados: [],
    descartados: [],
    preco_min: null,
    preco_mediana: null,
    preco_max: null,
    amostras: 0,
    tolerancia,
    limite_inferior: null,
    limite_superior: null,
    aviso: 'Nenhum preço numérico válido foi lido.',
  };
  if (precos.length === 0) return vazio;

  // mediana de referência sobre TODO o conjunto, define os limites
  const medRef = mediana(precos);
  const limite_inferior = medRef * (1 - tolerancia);
  const limite_superior = medRef * (1 + tolerancia);

  const usados = [];
  const descartados = [];
  for (const p of precos) {
    if (p >= limite_inferior && p <= limite_superior) usados.push(p);
    else descartados.push(p);
  }

  // se o descarte zerou a amostra (caso patológico), usa todos
  const base = usados.length > 0 ? usados : precos;
  const aviso =
    usados.length === 0
      ? 'Todos os preços caíram fora da tolerância; usando o conjunto completo.'
      : precos.length < 3
      ? 'Poucas amostras (<3): faixa pouco confiável, recalibre com mais anúncios.'
      : null;

  base.sort((a, b) => a - b);
  return {
    ok: true,
    usados: base,
    descartados,
    preco_min: round2(base[0]),
    preco_mediana: round2(mediana(base)),
    preco_max: round2(base[base.length - 1]),
    amostras: base.length,
    tolerancia,
    limite_inferior: round2(limite_inferior),
    limite_superior: round2(limite_superior),
    aviso,
  };
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

module.exports = { mediana, normalizarPrecos, calcularFaixa, TOLERANCIA_PADRAO };
