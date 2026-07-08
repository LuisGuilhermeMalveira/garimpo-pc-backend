'use strict';

/**
 * Decomposição de peças unitárias (PRODUTO/BANCO.md).
 *
 * Cataloga-se o MÓDULO, não o total. O app compõe:
 *   - RAM  -> LINEAR por módulo. 48GB = 3×16GB. (equivalência 100%)
 *   - SSD/HD -> por FAIXA, NÃO linear. Cada faixa (240/512/1TB) tem preço próprio;
 *     não se multiplica entre faixas. 1TB ≠ 2×512.
 *
 * Peças `inteira` (gpu/cpu/mobo/fonte/cooler/gabinete) passam direto.
 *
 * Saída: lista achatada de itens normalizados prontos pro casamento.
 *   { categoria, modelo_extraido, modelo_incerto, removivel, tipo,
 *     quantidade, capacidade }
 * onde, p/ unitárias, `capacidade` é o módulo/faixa e `quantidade` o nº de unidades.
 */

const CATEGORIAS_INTEIRAS = ['gpu', 'cpu', 'mobo', 'fonte', 'cooler', 'gabinete'];
const MODULOS_RAM = [4, 8, 16, 32]; // tamanhos de módulo reconhecidos
const DECOMP_MODULOS = [16, 8, 4]; // greedy de composição (48->3×16, 24->16+8, 12->8+4)
const FAIXAS_SSD = [120, 240, 512, 1024, 2048];
const FAIXAS_HD = [500, 1024, 2048];

/** Decompõe um total de RAM em módulos (greedy 16 -> 8 -> 4). */
function decomporRam(totalGB) {
  let resto = Math.max(0, Math.round(totalGB));
  const modulos = {};
  for (const m of DECOMP_MODULOS) {
    while (resto >= m) {
      modulos[m] = (modulos[m] || 0) + 1;
      resto -= m;
    }
  }
  if (resto > 0) modulos[4] = (modulos[4] || 0) + 1; // sobra <4GB vira um 4
  return modulos; // ex.: { 16: 3 } para 48GB; { 16:1, 8:1 } para 24GB
}

/**
 * Capacidade de armazenamento em GB: confia no campo `capacidade`; se vier
 * vazio, LÊ DO NOME ("SSD 480GB", "1TB", "2 TB", "HD 1tb"). Assim funciona
 * mesmo quando o parser não preencheu a capacidade.
 */
function gbArmazenamento(peca) {
  const cap = Number(peca.capacidade) || 0;
  if (cap > 0) return cap;
  const txt = String(peca.modelo || peca.modelo_extraido || '').toLowerCase();
  const tb = txt.match(/(\d+(?:[.,]\d+)?)\s*tb/); // "1tb", "2 tb", "1,5tb"
  if (tb) return Math.round(parseFloat(tb[1].replace(',', '.')) * 1024);
  const gb = txt.match(/(\d+)\s*gb/); // "480gb", "240 gb"
  if (gb) return Number(gb[1]);
  return 0;
}

/** SSD por faixa: 120 / 240 / 480-512 / 1TB / 2TB. */
function faixaSSD(gb) {
  const v = Math.round(gb);
  if (v <= 180) return 120;
  if (v <= 360) return 240;
  if (v <= 768) return 512; // 480/512 mesma faixa
  if (v <= 1536) return 1024; // 1TB
  return 2048; // 2TB+
}

/** HD por faixa: 500GB / 1TB / 2TB. */
function faixaHD(gb) {
  const v = Math.round(gb);
  if (v <= 750) return 500;
  if (v <= 1536) return 1024;
  return 2048;
}

/**
 * Lê o MÓDULO e a QUANTIDADE de RAM a partir do que está escrito, confiando
 * primeiro no texto e só depois na capacidade. Ordem:
 *   1) "NxM" (ex.: 2x8) -> N módulos de M
 *   2) "módulo 8GB" / "16GB" -> tamanho de módulo (qtd = peca.quantidade)
 *   3) capacidade (se for tamanho de módulo)
 * Retorna null quando só temos um total (ex.: "48GB") -> aí sim decompõe.
 */
function parseRam(peca) {
  const txt = String(peca.modelo || peca.modelo_extraido || '').toLowerCase();
  const qtd = Number(peca.quantidade) || 1;

  // 1) padrão NxM (2x8, 2 x 8GB) — M é o módulo, N a quantidade
  const nx = txt.match(/(\d+)\s*x\s*(\d+)/);
  if (nx) {
    const m = Number(nx[2]);
    if (m <= 32 && MODULOS_RAM.includes(m)) return { modulo: m, quantidade: Number(nx[1]) || qtd };
  }

  // 2) "NGB" que seja tamanho de módulo; "módulo 8GB" -> 8 (menor candidato)
  const candidatos = [...txt.matchAll(/(\d+)\s*gb/g)]
    .map((x) => Number(x[1]))
    .filter((g) => g <= 32 && MODULOS_RAM.includes(g));
  if (candidatos.length) return { modulo: Math.min(...candidatos), quantidade: qtd };

  // 3) capacidade como tamanho de módulo
  const cap = Number(peca.capacidade) || 0;
  if (cap > 0 && cap <= 32 && MODULOS_RAM.includes(cap)) return { modulo: cap, quantidade: qtd };

  return null;
}

/** Total de RAM em GB quando o módulo é desconhecido (ex.: "48GB"). */
function totalRam(peca) {
  const cap = Number(peca.capacidade) || 0;
  if (cap > 32) return cap;
  const m = String(peca.modelo || '').toLowerCase().match(/(\d+)\s*gb/);
  if (m && Number(m[1]) > 32) return Number(m[1]);
  const qtd = Number(peca.quantidade) || 1;
  return cap * qtd || cap;
}

function base(peca, extra) {
  return {
    categoria: peca.categoria,
    modelo_extraido: peca.modelo || '',
    modelo_incerto: !!peca.modelo_incerto,
    removivel: !!peca.removivel,
    ...extra,
  };
}

/**
 * @param {Array} pecas - peças cruas do parser
 * @returns {Array} itens achatados e normalizados
 */
function decompor(pecas) {
  const out = [];
  for (const peca of pecas || []) {
    const cat = peca.categoria;

    // preço manual (estimativa do Luís na triagem): vale a linha toda, não
    // decompõe nem consulta o banco. Funciona pra qualquer categoria.
    if (peca.preco_manual != null && Number(peca.preco_manual) > 0) {
      out.push(
        base(peca, {
          tipo: 'manual',
          quantidade: Number(peca.quantidade) || 1,
          capacidade: peca.capacidade != null ? Number(peca.capacidade) : null,
          preco_manual: Number(peca.preco_manual),
        })
      );
      continue;
    }

    if (CATEGORIAS_INTEIRAS.includes(cat)) {
      out.push(base(peca, { tipo: 'inteira', quantidade: Number(peca.quantidade) || 1, capacidade: null }));
      continue;
    }

    if (cat === 'ram') {
      const r = parseRam(peca);
      if (r) {
        // módulo conhecido -> qtd × esse módulo, SEM re-decompor (8GB ×2 = 2×8, não 1×16)
        out.push(
          base(peca, {
            tipo: 'unitaria',
            quantidade: r.quantidade,
            capacidade: r.modulo,
            modelo_extraido: `Memória ${r.modulo}GB${r.quantidade > 1 ? ` ×${r.quantidade}` : ''}`,
          })
        );
      } else {
        // só o total (ex.: "48GB") -> decompõe em módulos
        const total = totalRam(peca);
        const modulos = decomporRam(total);
        for (const [tam, q] of Object.entries(modulos)) {
          out.push(
            base(peca, {
              tipo: 'unitaria',
              quantidade: q,
              capacidade: Number(tam),
              modelo_extraido: `Memória ${tam}GB (de ${total}GB)`,
            })
          );
        }
      }
      continue;
    }

    if (cat === 'ssd' || cat === 'hd') {
      const gb = gbArmazenamento(peca);
      const faixa = cat === 'ssd' ? faixaSSD(gb || 512) : faixaHD(gb || 1024);
      out.push(
        base(peca, {
          tipo: 'unitaria',
          quantidade: Number(peca.quantidade) || 1,
          capacidade: faixa,
          modelo_extraido: peca.modelo || `${cat.toUpperCase()} ${gb || faixa}GB`,
        })
      );
      continue;
    }

    // categoria desconhecida: trata como inteira pra não perder
    out.push(base(peca, { tipo: 'inteira', quantidade: 1, capacidade: null }));
  }
  return out;
}

module.exports = { decompor, decomporRam, faixaSSD, faixaHD, FAIXAS_SSD, FAIXAS_HD, MODULOS_RAM };
