'use strict';

/**
 * Seletor da camada de IA.
 *
 * - Provider global por AI_PROVIDER (anthropic | openai).
 * - Override por tarefa via AI_PROVIDER_LOTE / AI_PROVIDER_PARSER /
 *   AI_PROVIDER_CALIBRADOR (caem no global se vazios).
 * - compararProviders(): roda o MESMO input nos dois providers e devolve
 *   as saídas lado a lado + tempo (ms) + erro, pra escolher com dado real.
 *
 * Providers são instanciados sob demanda (lazy) e cacheados — assim um
 * provider sem chave configurada não derruba o boot; só falha se for usado.
 */

const AnthropicProvider = require('./providers/anthropic');
const OpenAiProvider = require('./providers/openai');
const { getPrompt } = require('./prompts');

const FABRICAS = {
  anthropic: () => new AnthropicProvider(),
  openai: () => new OpenAiProvider(),
};

const PROVIDERS_VALIDOS = Object.keys(FABRICAS);
const _cache = {};

const ENV_POR_TAREFA = {
  calibrador: 'AI_PROVIDER_CALIBRADOR',
  parser: 'AI_PROVIDER_PARSER',
  lote: 'AI_PROVIDER_LOTE',
};

/**
 * Resolve qual provider usar para uma tarefa (ou o global).
 * @param {string} [tarefa] - 'calibrador' | 'parser' | 'lote'
 * @returns {string} nome do provider
 */
function resolverNomeProvider(tarefa) {
  const global = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
  let escolhido = global;
  if (tarefa && ENV_POR_TAREFA[tarefa]) {
    const override = (process.env[ENV_POR_TAREFA[tarefa]] || '').toLowerCase();
    if (override) escolhido = override;
  }
  if (!PROVIDERS_VALIDOS.includes(escolhido)) {
    throw new Error(
      `AI_PROVIDER inválido: "${escolhido}". Use: ${PROVIDERS_VALIDOS.join(', ')}`
    );
  }
  return escolhido;
}

/**
 * Instancia (com cache) um provider pelo nome.
 * @param {string} nome - 'anthropic' | 'openai'
 */
function instanciar(nome) {
  if (!FABRICAS[nome]) {
    throw new Error(`Provider desconhecido: "${nome}". Use: ${PROVIDERS_VALIDOS.join(', ')}`);
  }
  if (!_cache[nome]) {
    _cache[nome] = FABRICAS[nome]();
  }
  return _cache[nome];
}

/**
 * Retorna a instância do provider ativo para a tarefa (ou global).
 * Os serviços usam ESTE método — não importam providers direto.
 * @param {string} [tarefa]
 */
function getProvider(tarefa) {
  return instanciar(resolverNomeProvider(tarefa));
}

/**
 * Executa uma tarefa de IA já com o prompt/schema certos.
 * @param {Object} opts
 * @param {string} opts.tarefa - 'calibrador' | 'parser' | 'lote'
 * @param {Object} [opts.imagem] - { base64, mimetype }
 * @param {string} [opts.texto]
 * @param {string} [opts.providerNome] - força um provider específico (ignora env)
 * @returns {Promise<Object>} JSON extraído
 */
async function executarTarefa({ tarefa, imagem, imagens, texto, providerNome, contexto }) {
  const prompt = getPrompt(tarefa);
  const provider = providerNome ? instanciar(providerNome) : getProvider(tarefa);
  const instrucao = contexto ? `${prompt.instrucao}\n\nCONTEXTO: ${contexto}` : prompt.instrucao;
  const args = {
    schema: prompt.schema,
    instrucao,
    dificuldade: prompt.dificuldade,
  };
  // imagem + texto juntos: o texto da página vai como bloco adicional (fonte
  // extra pro parser). Fica FORA da instrução pra não invalidar o prompt cache.
  const temImagem = (imagens && imagens.length) || imagem;
  const textoExtra = temImagem && texto != null && String(texto).trim() ? String(texto).slice(0, 12000) : null;
  if (imagens && imagens.length) return provider.extrairDeImagem({ imagens, texto: textoExtra, ...args });
  if (imagem) return provider.extrairDeImagem({ imagem, texto: textoExtra, ...args });
  if (texto != null) return provider.extrairDeTexto({ texto, ...args });
  throw new Error('executarTarefa: forneça imagem(ns) ou texto');
}

/**
 * Roda a MESMA tarefa nos dois providers e devolve as saídas lado a lado.
 * Não lança se um provider falhar — registra o erro naquele item.
 * @returns {Promise<{tarefa, resultados: Array}>}
 */
async function compararProviders({ tarefa, imagem, texto }) {
  const resultados = await Promise.all(
    PROVIDERS_VALIDOS.map(async (nome) => {
      const inicio = Date.now();
      try {
        const data = await executarTarefa({ tarefa, imagem, texto, providerNome: nome });
        return { provider: nome, ok: true, ms: Date.now() - inicio, data };
      } catch (err) {
        return { provider: nome, ok: false, ms: Date.now() - inicio, erro: err.message };
      }
    })
  );
  return { tarefa, resultados };
}

module.exports = {
  PROVIDERS_VALIDOS,
  resolverNomeProvider,
  getProvider,
  executarTarefa,
  compararProviders,
};
