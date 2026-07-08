'use strict';

/**
 * Avaliador — o coração da lupa. Recebe a extração do parser e devolve o
 * veredito COMPLETO, com a conta aberta (ARQUITETURA.md "Pipeline de avaliação").
 *
 * Ordem:
 *   1. decompor unitárias (RAM linear; SSD/HD por faixa)
 *   2. casar com o banco; faltante -> estimador (se houver parente) ou marca incompleto
 *   3. valor_bruto = Σ preços aplicados
 *   4. modificadores -> valor_modificado = bruto × (1 + Σ%)
 *   5. fator de realização -> valor_revenda = modificado × fator
 *   6. custos: aquisição (frete OU combustível) + recuperação + margem de risco
 *   7. lucro_liquido = valor_revenda − preço − custos
 *   8. dias_ate_vender (peça-gargalo) -> lucro_por_mes
 *   9. negociador (3 preços + munição), canibalizador, score
 *  10. travas (GPU estimada, preço 🔴, score baixo) -> veredito + alertas
 */

const { query } = require('../db/pool');
const { decompor } = require('../utils/decompor');
const matcher = require('../utils/matcher');
const estimador = require('./estimador');
const modificadoresSvc = require('./modificadores');
const scoreSvc = require('./score');
const negociador = require('./negociador');
const canibalizador = require('./canibalizador');
const { classificarFrescor } = require('./frescor');
const { normalizar } = require('../utils/texto');
const { rotuloGenerico } = require('../utils/genericos');
const C = require('../config/constantes');

// ---------- carregadores ----------
async function carregarConfig(userId) {
  const { rows } = await query(
    `SELECT fator_realizacao, piso_lucro, margem_risco_pct, custo_km, pisos
       FROM usuarios WHERE id = $1`,
    [userId]
  );
  const u = rows[0] || {};
  return {
    fator_realizacao: Number(u.fator_realizacao ?? 0.9),
    piso_lucro: Number(u.piso_lucro ?? 250),
    margem_risco_pct: Number(u.margem_risco_pct ?? 0.05),
    custo_km: Number(u.custo_km ?? 0.42),
    pisos: u.pisos || null,
  };
}

async function carregarCatalogo(userId) {
  const { rows } = await query(
    `SELECT p.id, p.categoria, p.nome, p.tipo, p.capacidade, p.liquidez, p.dias_venda_estim,
            pb.preco_mediana, pb.preco_min, pb.preco_max, pb.data_calibracao,
            (CURRENT_DATE - pb.data_calibracao::date) AS dias_desde_calibracao
       FROM pecas p
       LEFT JOIN LATERAL (
         SELECT * FROM precos_base WHERE peca_id = p.id
         ORDER BY data_calibracao DESC LIMIT 1
       ) pb ON true
      WHERE p.user_id = $1`,
    [userId]
  );
  return rows;
}

async function carregarModificadores(userId) {
  const { rows } = await query(
    `SELECT id, nome, gatilho, sentido, percentual, argumento, ativo
       FROM modificadores WHERE user_id = $1 AND ativo = true`,
    [userId]
  );
  return rows;
}

async function carregarCidades(userId) {
  const { rows } = await query(
    `SELECT id, nome, km_ida_volta, custo_aquisicao FROM cidades WHERE user_id = $1`,
    [userId]
  );
  return rows;
}

function acharCidade(cidades, nomeOuId) {
  if (nomeOuId == null) return null;
  if (typeof nomeOuId === 'number') return cidades.find((c) => c.id === nomeOuId) || null;
  const alvo = normalizar(nomeOuId);
  if (!alvo) return null;
  return (
    cidades.find((c) => normalizar(c.nome) === alvo) ||
    cidades.find((c) => normalizar(c.nome).includes(alvo) || alvo.includes(normalizar(c.nome))) ||
    null
  );
}

function diasDaPeca(item) {
  if (item.dias_venda_estim != null) return Number(item.dias_venda_estim);
  return C.DIAS_POR_LIQUIDEZ[item.liquidez] || C.DIAS_POR_LIQUIDEZ.media;
}

function r2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * @param {Object} opts
 * @param {Object} opts.extracao - saída do parser
 * @param {number} opts.userId
 * @param {Object} [opts.opcoes] - { cidade_id, custo_recuperacao, excluir_removiveis }
 * @returns {Promise<Object>} resultado completo
 */
async function avaliar({ extracao, userId = 1, opcoes = {} }) {
  const [config, catalogo, modificadores, cidades] = await Promise.all([
    carregarConfig(userId),
    carregarCatalogo(userId),
    carregarModificadores(userId),
    carregarCidades(userId),
  ]);

  const catalogoComPreco = catalogo.filter((p) => p.preco_mediana != null);
  // pisos do usuário sobre os defaults (fallback se a config estiver vazia)
  const pisos = { ...C.PISO_CATEGORIA, ...(config.pisos || {}) };
  const sinais = extracao.sinais || {};
  const alertas = [];
  const travas = [];

  // nome vazio -> cai pro nome da categoria ("Fonte", "Placa-mãe"...)
  const pecasNorm = (extracao.pecas || []).map((p) => ({
    ...p,
    modelo: p.modelo && String(p.modelo).trim() ? p.modelo : rotuloGenerico(p.categoria),
  }));

  // 1-2. decompor + casar
  const decomp = decompor(pecasNorm);
  const itens = decomp.map((item) => {
    const qtd = Number(item.quantidade) || 1;

    // preço manual (estimativa do Luís na triagem): usa direto, NÃO trava,
    // NÃO consulta o banco. Marca como estimado+manual.
    if (item.tipo === 'manual') {
      const total = Number(item.preco_manual) || 0;
      return {
        categoria: item.categoria,
        modelo_extraido: item.modelo_extraido,
        modelo_incerto: !!item.modelo_incerto,
        removivel: !!item.removivel,
        peca_id: null,
        peca_nome: null,
        quantidade: qtd,
        preco_unitario: r2(total / qtd),
        preco_aplicado: r2(total),
        aplicado_min: r2(total),
        aplicado_max: r2(total),
        origem: 'estimado',
        manual: true,
        piso: false,
        peca_referencia_id: null,
        frescor_dias: null,
        frescor: classificarFrescor(null),
        liquidez: 'media',
        dias_venda_estim: null,
        faltante: false,
        match_score: 0,
      };
    }

    const { peca, score } = matcher.casar(item, catalogo);

    // casou e tem preço calibrado -> real
    if (peca && peca.preco_mediana != null) {
      const unit = Number(peca.preco_mediana);
      const dias = peca.dias_desde_calibracao == null ? null : Number(peca.dias_desde_calibracao);
      return {
        categoria: item.categoria,
        modelo_extraido: item.modelo_extraido,
        modelo_incerto: item.modelo_incerto,
        removivel: item.removivel,
        peca_id: peca.id,
        peca_nome: peca.nome,
        quantidade: qtd,
        preco_unitario: r2(unit),
        preco_aplicado: r2(unit * qtd),
        aplicado_min: peca.preco_min != null ? r2(Number(peca.preco_min) * qtd) : r2(unit * qtd),
        aplicado_max: peca.preco_max != null ? r2(Number(peca.preco_max) * qtd) : r2(unit * qtd),
        origem: 'real',
        manual: false,
        piso: false,
        peca_referencia_id: null,
        frescor_dias: dias,
        frescor: classificarFrescor(dias),
        liquidez: peca.liquidez,
        dias_venda_estim: peca.dias_venda_estim,
        faltante: false,
        match_score: r2(score),
      };
    }

    // não casou com preço -> tenta estimar por parente
    const est = estimador.estimar(item, catalogoComPreco);
    if (est) {
      const unit = Number(est.peca.preco_mediana);
      const dias =
        est.peca.dias_desde_calibracao == null ? null : Number(est.peca.dias_desde_calibracao);
      alertas.push({ nivel: 'amarelo', msg: `${item.modelo_extraido}: ${est.motivo}` });
      if (estimador.ehTravaDeEstimativa(item.categoria) && item.categoria === 'gpu') {
        travas.push('GPU estimada (não calibrada) — veredito travado em ⚠️.');
      }
      return {
        categoria: item.categoria,
        modelo_extraido: item.modelo_extraido,
        modelo_incerto: item.modelo_incerto,
        removivel: item.removivel,
        peca_id: null,
        peca_nome: est.peca.nome,
        quantidade: qtd,
        preco_unitario: r2(unit),
        preco_aplicado: r2(unit * qtd),
        aplicado_min: est.peca.preco_min != null ? r2(Number(est.peca.preco_min) * qtd) : r2(unit * qtd),
        aplicado_max: est.peca.preco_max != null ? r2(Number(est.peca.preco_max) * qtd) : r2(unit * qtd),
        origem: 'estimado',
        manual: false,
        piso: false,
        peca_referencia_id: est.peca.id,
        frescor_dias: dias,
        frescor: classificarFrescor(dias),
        liquidez: est.peca.liquidez,
        dias_venda_estim: est.peca.dias_venda_estim,
        faltante: false,
        match_score: 0,
      };
    }

    // PISO de categoria: conta a peça genérica num valor de chão (sem % desconto)
    // em vez de travar. GPU não tem piso (precisa saber o modelo).
    const piso = pisos[item.categoria];
    if (piso != null && piso > 0) {
      const total = r2(piso * qtd);
      return {
        categoria: item.categoria,
        modelo_extraido: item.modelo_extraido,
        modelo_incerto: item.modelo_incerto,
        removivel: item.removivel,
        peca_id: peca ? peca.id : null,
        peca_nome: peca ? peca.nome : null,
        quantidade: qtd,
        preco_unitario: r2(piso),
        preco_aplicado: total,
        aplicado_min: total,
        aplicado_max: total,
        origem: 'estimado',
        manual: false,
        piso: true,
        peca_referencia_id: null,
        frescor_dias: null,
        frescor: classificarFrescor(null),
        liquidez: peca ? peca.liquidez : 'media',
        dias_venda_estim: peca ? peca.dias_venda_estim : null,
        faltante: false,
        match_score: r2(score),
      };
    }

    // faltante de verdade (sem piso -> ex.: GPU sem modelo)
    return {
      categoria: item.categoria,
      modelo_extraido: item.modelo_extraido,
      modelo_incerto: item.modelo_incerto,
      removivel: item.removivel,
      peca_id: peca ? peca.id : null,
      peca_nome: peca ? peca.nome : null,
      quantidade: qtd,
      preco_unitario: null,
      preco_aplicado: null,
      aplicado_min: null,
      aplicado_max: null,
      origem: 'real',
      manual: false,
      piso: false,
      peca_referencia_id: null,
      frescor_dias: null,
      frescor: classificarFrescor(null),
      liquidez: peca ? peca.liquidez : null,
      dias_venda_estim: peca ? peca.dias_venda_estim : null,
      faltante: true,
      match_score: r2(score),
    };
  });

  const faltantes = itens.filter((i) => i.faltante);

  // aviso (não-trava) das peças contadas por piso genérico
  const comPiso = itens.filter((i) => i.piso);
  if (comPiso.length > 0) {
    alertas.push({
      nivel: 'amarelo',
      msg: `Piso genérico em: ${comPiso.map((i) => i.modelo_extraido).join(', ')}. Estime ou calibre pra cravar o valor.`,
    });
  }

  // 3. valor bruto (respeita "simular sem removíveis")
  const excluirRem = !!opcoes.excluir_removiveis;
  const itensValor = itens.filter((i) => !i.faltante && !(excluirRem && i.removivel));
  const valor_bruto_pecas = r2(itensValor.reduce((acc, i) => acc + Number(i.preco_aplicado || 0), 0));
  // faixa da soma das peças (pra visualizar piso/teto de mercado)
  const valor_bruto_min = r2(itensValor.reduce((acc, i) => acc + Number(i.aplicado_min || 0), 0));
  const valor_bruto_max = r2(itensValor.reduce((acc, i) => acc + Number(i.aplicado_max || 0), 0));

  // 4. modificadores
  const { aplicados, soma_percentual } = modificadoresSvc.aplicar(
    sinais,
    pecasNorm,
    modificadores,
    opcoes.modificadores_off || []
  );
  const valor_modificado = r2(valor_bruto_pecas * (1 + soma_percentual));

  // 5. realização
  const valor_revenda = r2(valor_modificado * config.fator_realizacao);

  // 6. custos
  const cidade = acharCidade(cidades, opcoes.cidade_id ?? extracao.cidade);
  const temEntrega = !!extracao.tem_entrega;
  let custo_aquisicao = 0;
  if (temEntrega) {
    custo_aquisicao = Number(extracao.valor_entrega) || C.FRETE_PADRAO;
  } else if (cidade) {
    custo_aquisicao = Number(cidade.custo_aquisicao) || 0;
  } else if (extracao.cidade) {
    alertas.push({
      nivel: 'amarelo',
      msg: `Cidade "${extracao.cidade}" não cadastrada — combustível não descontado. Cadastre em /cidades.`,
    });
  }
  custo_aquisicao = r2(custo_aquisicao);

  // recuperação NÃO é mais automática (não inflava o desconto). Default 0;
  // Luís informa o custo real de troca/limpeza quando houver.
  let custo_recuperacao = opcoes.custo_recuperacao != null ? Number(opcoes.custo_recuperacao) : 0;
  custo_recuperacao = r2(custo_recuperacao);

  const preco_ref = Number(extracao.preco_pix ?? extracao.preco_pedido) || 0;
  const margem_risco = r2(config.margem_risco_pct * preco_ref);

  // 7. lucro
  const lucro_liquido = r2(
    valor_revenda - preco_ref - custo_aquisicao - custo_recuperacao - margem_risco
  );
  // % de ganho sobre o que você paga
  const lucro_percentual = preco_ref > 0 ? Math.round((lucro_liquido / preco_ref) * 1000) / 10 : null;

  // 8. dias até vender (peça-gargalo = maior tempo) -> lucro/mês
  const reconhecidos = itens.filter((i) => !i.faltante);
  const dias_ate_vender =
    reconhecidos.length > 0 ? Math.max(...reconhecidos.map(diasDaPeca)) : null;
  const lucro_por_mes =
    dias_ate_vender && dias_ate_vender > 0 ? r2(lucro_liquido / (dias_ate_vender / 30)) : null;

  // 9. score, negociação, canibalização
  const score = scoreSvc.calcular({ itens, sinais });
  if (score.trava) travas.push(`Score de confiança baixo (${score.valor}/100) — veredito travado em ⚠️.`);

  const negociacao = negociador.calcular({
    valor_revenda,
    custo_aquisicao,
    custo_recuperacao,
    margem_risco_pct: config.margem_risco_pct,
    piso_lucro: config.piso_lucro,
    preco_pedido: preco_ref,
    aplicados,
    sinais,
    itens,
  });

  const canibalizacao = canibalizador.calcular({
    valor_revenda_montado: valor_revenda,
    itens,
    fator_realizacao: config.fator_realizacao,
  });

  // 10. trava de preço 🔴 defasado (peça reconhecida com calibração velha)
  const temDefasado = reconhecidos.some(
    (i) => i.frescor_dias != null && i.frescor_dias >= C.FRESCOR_DEFASADO_DIAS
  );
  if (temDefasado) travas.push('Preço-base defasado (🔴 31+ dias) em peça relevante — recalibre.');

  // ---- veredito ----
  let veredito;
  if (faltantes.length > 0) {
    veredito = 'incompleto';
    alertas.push({
      nivel: 'amarelo',
      msg: `Faltam preços de ${faltantes.length} peça(s): ${faltantes
        .map((f) => f.modelo_extraido)
        .join(', ')}. Calibre pra fechar o veredito.`,
    });
  } else if (lucro_liquido <= 0) {
    veredito = 'nao_compensa';
  } else if (lucro_liquido >= config.piso_lucro && travas.length === 0) {
    veredito = 'compensa';
  } else {
    veredito = 'marginal';
  }

  if (sinais.possivel_mineracao)
    alertas.push({ nivel: 'vermelho', msg: 'Sinais de possível mineração — risco de desgaste.' });

  return {
    veredito,
    // conta aberta
    itens,
    faltantes: faltantes.map((f) => f.modelo_extraido),
    valor_bruto_pecas,
    valor_bruto_min,
    valor_bruto_max,
    modificadores_aplicados: aplicados,
    soma_modificadores_pct: soma_percentual,
    valor_modificado,
    fator_realizacao: config.fator_realizacao,
    valor_revenda,
    cidade: cidade ? { id: cidade.id, nome: cidade.nome } : null,
    tem_entrega: temEntrega,
    custo_aquisicao,
    custo_recuperacao,
    margem_risco,
    preco_pedido: Number(extracao.preco_pedido) || null,
    preco_pix: Number(extracao.preco_pix) || null,
    lucro_liquido,
    lucro_percentual,
    dias_ate_vender,
    lucro_por_mes,
    // extras
    negociacao,
    canibalizacao,
    score,
    travas,
    alertas,
    config_usada: config,
  };
}

module.exports = { avaliar };
