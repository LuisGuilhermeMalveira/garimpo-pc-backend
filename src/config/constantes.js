'use strict';

/**
 * Constantes de negócio da triagem (Fase 2).
 * Valores que NÃO ficam no usuário (esses estão em `usuarios`: fator_realizacao,
 * piso_lucro, margem_risco_pct, custo_km). Aqui ficam defaults operacionais.
 */

module.exports = {
  // Frete padrão quando o anúncio tem entrega mas não informa o valor (~R$26).
  FRETE_PADRAO: 26,

  // PISO por categoria: valor de CHÃO de uma peça genérica/sem modelo, em R$.
  // Quando a peça não casa no banco e não tem preço manual, é contada por esse
  // piso (valor baixo conservador) em vez de virar "faltante" e travar o PC.
  // Princípio do Luís: todo item conta; genérico entra barato, sem % de desconto.
  //   GPU = null de propósito: define ~50% do PC, tem que saber o modelo.
  PISO_CATEGORIA: {
    cpu: 150,
    gpu: null, // sem piso — exige modelo/estimativa
    mobo: 120,
    ram: 50, // por módulo (8GB)
    fonte: 150,
    ssd: 90, // por unidade/faixa
    hd: 70,
    cooler: 25,
    gabinete: 70,
    monitor: 200,
    periferico: 30,
    outro: 0,
  },

  // Custo de recuperação sugerido por sinal (editável no request).
  RECUPERACAO: {
    fonte_generica: 150, // trocar fonte sem marca por uma de marca
    limpeza: 0, // limpeza/repaste — opcional, default 0
  },

  // Score de confiança (0-100): deduções por omissão/risco.
  SCORE: {
    INICIAL: 100,
    DEDUCAO_MODELO_INCERTO: 15,
    DEDUCAO_FALTANTE: 10,
    DEDUCAO_ESTIMADO: 8,
    DEDUCAO_SEM_FOTO_RODANDO: 10,
    DEDUCAO_POSSIVEL_MINERACAO: 10,
    DEDUCAO_FONTE_SEM_MARCA: 5,
    // abaixo disso, trava o veredito em ⚠️ (marginal no máximo)
    LIMIAR_TRAVA: 50,
  },

  // Negociação: onde abrir a oferta em relação ao teto (10% abaixo do teto).
  FATOR_OFERTA: 0.9,

  // Frescor 🔴 (defasado) a partir de quantos dias — usado como trava.
  FRESCOR_DEFASADO_DIAS: 31,

  // Canibalização só é destacada se render pelo menos isso a mais que montado.
  CANIBALIZAR_LIMIAR_GANHO: 100,

  // Dias até vender por liquidez, quando a peça-gargalo não tem dias_venda_estim.
  DIAS_POR_LIQUIDEZ: { alta: 7, media: 20, baixa: 45 },
};
