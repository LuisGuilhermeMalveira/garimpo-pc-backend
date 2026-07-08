'use strict';

/**
 * Calibrador AUTOMÁTICO — recebe print(s) de página de BUSCA e, sem escolher
 * peça antes: a IA identifica cada anúncio avulso (nome canônico + preço),
 * o serviço agrupa por modelo, casa com o catálogo do usuário (matcher) e
 * grava uma calibração (mediana com descarte de outliers) pra cada peça casada.
 *
 * Conservador por princípio:
 *  - só grava com >= MIN_AMOSTRAS preços válidos no grupo;
 *  - grupo sem peça correspondente no banco NÃO cria peça sozinho — vira
 *    "ignorada" com o motivo (descoberta sob demanda: o Luís decide criar);
 *  - dry_run=true faz tudo menos gravar (pra conferir antes).
 */

const crypto = require('crypto');
const ai = require('../ai');
const { query } = require('../db/pool');
const { calcularFaixa } = require('../utils/mediana');
const { bufferParaTiles } = require('../utils/imagem');
const { casar } = require('../utils/matcher');
const { classificarFrescor } = require('./frescor');

function hashImagem(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// mínimo de anúncios pra gravar. 1 é seguro DESDE a view precos_efetivos
// pesar por amostras: entrada de 1 anúncio soma pouco, não domina o preço.
// (Busca de CPU devolve 15 modelos diferentes com 1 anúncio cada — exigir 2
// jogava tudo fora.)
const MIN_AMOSTRAS = 1;

const CATS_UNITARIA = new Set(['ram', 'ssd', 'hd']);

// capacidade em GB a partir do nome canônico ("SSD 480GB", "HD 1TB", "Memória 8GB DDR4")
function capacidadeDoModelo(modelo) {
  const m = String(modelo).match(/(\d+(?:[.,]\d+)?)\s*(tb|gb)/i);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  return Math.round(m[2].toLowerCase() === 'tb' ? n * 1024 : n);
}

// ruído que NÃO diferencia a peça pra fins de preço — some no agrupamento:
//  - tipo de memória (DDR5/GDDR5/GDDR6X...): o banco é por chip+VRAM, não por tipo.
//    além de fragmentar, o "5" de DDR5 injeta um número que quebra o casamento.
//  - marketing/edição (OC, gaming, dual, 3 fans...).
const RUIDO = /\b(g?ddr\d[a-z]*|oc|gaming|windforce|dual|sc|itx|mini|founders|fe|[0-9]\s*fans?)\b/gi;

function normalizarModelo(modelo) {
  return String(modelo).replace(RUIDO, ' ').replace(/\s+/g, ' ').trim();
}

function chaveGrupo(item) {
  return `${item.categoria}|${normalizarModelo(item.modelo).toLowerCase()}`;
}

async function carregarCatalogo(userId) {
  const { rows } = await query(
    `SELECT p.id, p.categoria, p.nome, p.tipo, p.capacidade,
            pe.preco_mediana, pe.amostras AS amostras_acumuladas,
            (CURRENT_DATE - pe.data_calibracao::date) AS dias_calibracao
       FROM pecas p
       LEFT JOIN precos_efetivos pe ON pe.peca_id = p.id
      WHERE p.user_id = $1`,
    [userId]
  );
  return rows;
}

async function gravarCalibracao({ peca_id, faixa, fonte }) {
  const { rows } = await query(
    `INSERT INTO precos_base (peca_id, preco_min, preco_mediana, preco_max, amostras, fonte)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, data_calibracao`,
    [peca_id, faixa.preco_min, faixa.preco_mediana, faixa.preco_max, faixa.amostras, fonte]
  );
  return { ...rows[0], frescor: classificarFrescor(0) };
}

/**
 * @param {Object} opts
 * @param {Array<{buffer:Buffer}>} opts.imagens - print(s) de busca
 * @param {number} opts.userId
 * @param {string} [opts.provider] - override anthropic/openai
 * @param {number} [opts.tolerancia] - descarte de outliers (default 0.35)
 * @param {boolean} [opts.dryRun] - true = identifica e casa, mas NÃO grava
 */
async function calibrarAuto({ imagens, userId, provider, tolerancia, dryRun = false }) {
  if (!imagens || !imagens.length) throw new Error('calibrarAuto: envie ao menos um print.');

  const providerNome = provider || ai.resolverNomeProvider('calibrador');

  // 0) anti-duplicata: print idêntico (mesmo hash) já calibrado é barrado
  //    ANTES de gastar IA — protege o banco de dupla contagem. (dry_run passa
  //    direto: é modo de teste.)
  let imgs = imagens;
  let hashesNovos = [];
  let observacoes = '';
  if (!dryRun) {
    const unicos = [];
    const vistos = new Set();
    for (const im of imagens) {
      const h = hashImagem(im.buffer);
      if (vistos.has(h)) continue; // mesmo arquivo repetido no mesmo envio
      vistos.add(h);
      unicos.push({ im, h });
    }
    const { rows } = await query(
      `SELECT hash, to_char(criado_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM') AS dia
         FROM prints_processados WHERE user_id = $1 AND hash = ANY($2)`,
      [userId, unicos.map((u) => u.h)]
    );
    const jaVistos = new Map(rows.map((r) => [r.hash, r.dia]));
    const novos = unicos.filter((u) => !jaVistos.has(u.h));
    if (novos.length === 0) {
      const dia = rows[0] ? rows[0].dia : '';
      throw new Error(
        `Print idêntico já calibrado${dia ? ` em ${dia}` : ''} — barrado pra não contar dobrado. ` +
          'A OLX muda toda hora: atualize a busca e capture de novo.'
      );
    }
    if (novos.length < unicos.length) {
      observacoes += `${unicos.length - novos.length} print(s) idêntico(s) já calibrado(s) — pulados.`;
    }
    imgs = novos.map((u) => u.im);
    hashesNovos = novos.map((u) => u.h);
  }

  // 1) IA lê cada print (fatiado se for comprido) e lista {categoria, modelo, preco}
  const itens = [];
  for (const img of imgs) {
    const fatias = await bufferParaTiles(img.buffer);
    for (const tile of fatias.tiles) {
      const ex = await ai.executarTarefa({ tarefa: 'calibrador_auto', imagem: tile, providerNome });
      if (Array.isArray(ex && ex.itens)) itens.push(...ex.itens);
      if (ex && ex.observacoes) observacoes += (observacoes ? ' · ' : '') + ex.observacoes;
    }
    if (fatias.truncado) {
      observacoes += (observacoes ? ' · ' : '') + 'Print muito longo: li só a parte inicial.';
    }
  }

  // 2) agrupa por peça canônica
  const grupos = new Map();
  for (const it of itens) {
    if (!it || !it.modelo || !(Number(it.preco) > 0)) continue;
    const k = chaveGrupo(it);
    if (!grupos.has(k)) grupos.set(k, { categoria: it.categoria, modelo: normalizarModelo(it.modelo), precos: [] });
    grupos.get(k).precos.push(Number(it.preco));
  }

  // 3) casa cada grupo com o banco e grava mediana
  const catalogo = await carregarCatalogo(userId);
  const calibradas = [];
  const ignoradas = [];

  for (const g of grupos.values()) {
    const tipo = CATS_UNITARIA.has(g.categoria) ? 'unitaria' : 'inteira';
    const item = {
      categoria: g.categoria,
      tipo,
      capacidade: tipo === 'unitaria' ? capacidadeDoModelo(g.modelo) : null,
      modelo_extraido: g.modelo,
    };
    const { peca } = casar(item, catalogo);

    if (g.precos.length < MIN_AMOSTRAS) {
      ignoradas.push({ modelo: g.modelo, categoria: g.categoria, precos: g.precos, motivo: `só ${g.precos.length} anúncio (mínimo ${MIN_AMOSTRAS})` });
      continue;
    }
    const faixa = calcularFaixa(g.precos, tolerancia);
    if (!faixa.ok) {
      ignoradas.push({ modelo: g.modelo, categoria: g.categoria, precos: g.precos, motivo: faixa.aviso || 'faixa inválida' });
      continue;
    }
    if (!peca) {
      ignoradas.push({ modelo: g.modelo, categoria: g.categoria, precos: g.precos, faixa, motivo: 'peça não existe no banco — crie no Catálogo e recalibre' });
      continue;
    }

    // sentinela anti-outlier solitário: 1 anúncio destoando >40% de um preço
    // FIRME (>=6 amostras) e FRESCO (<=21 dias) não entra sozinho — provável
    // anúncio quebrado/errado. Anti-congelamento: se o mercado mudou de
    // verdade, virão VÁRIOS anúncios no preço novo — 2+ amostras passam e
    // atualizam o banco normalmente; banco velho/magro também não barra.
    const banco = peca.preco_mediana != null ? Number(peca.preco_mediana) : null;
    const bancoFirme =
      banco != null &&
      Number(peca.amostras_acumuladas) >= 6 &&
      peca.dias_calibracao != null &&
      Number(peca.dias_calibracao) <= 21;
    if (g.precos.length === 1 && bancoFirme) {
      const desvio = Math.abs(g.precos[0] - banco) / banco;
      if (desvio > 0.4) {
        ignoradas.push({
          modelo: g.modelo,
          categoria: g.categoria,
          precos: g.precos,
          motivo: `único anúncio destoa ${Math.round(desvio * 100)}% do banco (R$${g.precos[0]} vs R$${Math.round(banco)}) — não entra sozinho; se o preço mudou mesmo, mais anúncios assim vão aparecer e aí entram`,
        });
        continue;
      }
    }

    let gravacao = null;
    if (!dryRun) {
      gravacao = await gravarCalibracao({ peca_id: peca.id, faixa, fonte: 'auto print' });
    }
    // amostras que valem pra confiança = TOTAL acumulado (antes + este print),
    // não só as deste print. Assim peça já calibrada não dá falso "base fraca".
    const acumuladasAntes = Number(peca.amostras_acumuladas) || 0;
    calibradas.push({
      peca_id: peca.id,
      peca: peca.nome,
      modelo_lido: g.modelo,
      preco_anterior: peca.preco_mediana != null ? Number(peca.preco_mediana) : null,
      preco_mediana: faixa.preco_mediana,
      preco_min: faixa.preco_min,
      preco_max: faixa.preco_max,
      amostras_print: faixa.amostras,          // anúncios lidos neste print
      amostras: acumuladasAntes + faixa.amostras, // total acumulado (base da confiança)
      outliers_descartados: g.precos.length - faixa.amostras,
      gravado: !dryRun,
      data: gravacao ? gravacao.data_calibracao : null,
    });
  }

  // 4) registra os hashes processados (reenvio idêntico será barrado) e
  //    limpa registros velhos (>90 dias)
  if (!dryRun && hashesNovos.length) {
    await query(
      `INSERT INTO prints_processados (user_id, hash)
       SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`,
      [userId, hashesNovos]
    );
    await query(
      `DELETE FROM prints_processados WHERE user_id = $1 AND criado_em < now() - interval '90 days'`,
      [userId]
    );
  }

  return {
    provider: providerNome,
    anuncios_lidos: itens.length,
    calibradas,
    ignoradas,
    observacoes,
    dry_run: !!dryRun,
  };
}

module.exports = { calibrarAuto };
