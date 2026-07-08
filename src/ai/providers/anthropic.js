'use strict';

/**
 * Provider Anthropic (Claude). Vision nativa pra prints.
 * JSON via prompt + parse seguro (strip de cercas ```), padrão ProvaDoc.
 *
 * Modelos:
 *   - dificuldade 'dificil' -> ANTHROPIC_MODEL        (default sonnet, leitura difícil)
 *   - dificuldade 'rapido'  -> ANTHROPIC_MODEL_RAPIDO (default haiku, lote barato)
 */

const Anthropic = require('@anthropic-ai/sdk');
const { AiProvider, parseJsonSeguro } = require('../interface');

const MODELO_DIFICIL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const MODELO_RAPIDO = process.env.ANTHROPIC_MODEL_RAPIDO || 'claude-haiku-4-5-20251001';

class AnthropicProvider extends AiProvider {
  constructor() {
    super();
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY não definido (.env) — provider anthropic indisponível.');
    }
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  get nome() {
    return 'anthropic';
  }

  _modelo(dificuldade) {
    return dificuldade === 'rapido' ? MODELO_RAPIDO : MODELO_DIFICIL;
  }

  /**
   * Monta a instrução final reforçando o schema (Claude não tem structured
   * output nativo — pedimos o JSON e reforçamos o formato).
   */
  _instrucaoComSchema(instrucao, schema) {
    if (!schema) return instrucao;
    const corpo = schema.schema || schema;
    return [
      instrucao,
      '',
      'Responda EXCLUSIVAMENTE com um JSON válido seguindo este JSON Schema (sem comentários, sem texto fora do JSON):',
      '```json',
      JSON.stringify(corpo, null, 2),
      '```',
    ].join('\n');
  }

  /**
   * A instrução+schema vai como SYSTEM com prompt caching (ephemeral, 5 min):
   * é idêntica em toda chamada da mesma tarefa — nos tiles de uma calibração e
   * entre calibrações seguidas, sai do cache com ~90% de desconto. As imagens
   * (que variam) ficam DEPOIS do prefixo cacheado, então não invalidam nada.
   */
  async _chamar({ system, conteudo, dificuldade }) {
    const resp = await this.client.messages.create({
      model: this._modelo(dificuldade),
      max_tokens: 2048,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: conteudo }],
    });
    const texto = (resp.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return parseJsonSeguro(texto);
  }

  async extrairDeImagem({ imagem, imagens, texto, schema, instrucao, dificuldade }) {
    const lista = imagens && imagens.length ? imagens : imagem ? [imagem] : [];
    if (lista.length === 0 || !lista[0].base64) {
      throw new Error('extrairDeImagem: forneça imagem(ns) com base64');
    }
    const conteudo = [
      ...lista.map((im) => ({
        type: 'image',
        source: { type: 'base64', media_type: im.mimetype || 'image/png', data: im.base64 },
      })),
      ...(texto
        ? [{ type: 'text', text: `TEXTO DA PÁGINA (capturado junto do print; fonte adicional):\n${texto}` }]
        : []),
      { type: 'text', text: 'Extraia os dados do(s) print(s) acima conforme as instruções.' },
    ];
    return this._chamar({
      system: this._instrucaoComSchema(instrucao, schema),
      conteudo,
      dificuldade,
    });
  }

  async extrairDeTexto({ texto, schema, instrucao, dificuldade }) {
    const conteudo = [{ type: 'text', text: '--- CONTEÚDO ---\n' + String(texto || '') }];
    return this._chamar({
      system: this._instrucaoComSchema(instrucao, schema),
      conteudo,
      dificuldade,
    });
  }
}

module.exports = AnthropicProvider;
