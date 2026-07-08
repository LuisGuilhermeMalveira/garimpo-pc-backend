'use strict';

/**
 * Provider OpenAI (GPT-4o). Vision nativa pra prints.
 * Usa STRUCTURED OUTPUTS (response_format json_schema) quando há schema —
 * o JSON sai garantido pelo schema. Sem schema, cai em json_object.
 *
 * Modelos:
 *   - dificuldade 'dificil' -> OPENAI_MODEL        (default gpt-4o)
 *   - dificuldade 'rapido'  -> OPENAI_MODEL_RAPIDO (default gpt-4o-mini)
 */

const OpenAI = require('openai');
const { AiProvider, parseJsonSeguro } = require('../interface');

const MODELO_DIFICIL = process.env.OPENAI_MODEL || 'gpt-4o';
const MODELO_RAPIDO = process.env.OPENAI_MODEL_RAPIDO || 'gpt-4o-mini';

class OpenAiProvider extends AiProvider {
  constructor() {
    super();
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY não definido (.env) — provider openai indisponível.');
    }
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  get nome() {
    return 'openai';
  }

  _modelo(dificuldade) {
    return dificuldade === 'rapido' ? MODELO_RAPIDO : MODELO_DIFICIL;
  }

  _responseFormat(schema) {
    if (!schema) {
      return { type: 'json_object' };
    }
    // schema esperado no formato { name, schema } (ver ai/prompts.js)
    const name = schema.name || 'resposta';
    const corpo = schema.schema || schema;
    return {
      type: 'json_schema',
      json_schema: { name, schema: corpo, strict: true },
    };
  }

  async _chamar(messages, schema, dificuldade) {
    const resp = await this.client.chat.completions.create({
      model: this._modelo(dificuldade),
      messages,
      response_format: this._responseFormat(schema),
      max_tokens: 2048,
    });
    const texto = resp.choices && resp.choices[0] && resp.choices[0].message.content;
    return parseJsonSeguro(texto);
  }

  async extrairDeImagem({ imagem, imagens, texto, schema, instrucao, dificuldade }) {
    const lista = imagens && imagens.length ? imagens : imagem ? [imagem] : [];
    if (lista.length === 0 || !lista[0].base64) {
      throw new Error('extrairDeImagem: forneça imagem(ns) com base64');
    }
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: instrucao },
          ...lista.map((im) => ({
            type: 'image_url',
            image_url: { url: `data:${im.mimetype || 'image/png'};base64,${im.base64}` },
          })),
          ...(texto
            ? [{ type: 'text', text: `TEXTO DA PÁGINA (capturado junto do print; fonte adicional):\n${texto}` }]
            : []),
        ],
      },
    ];
    return this._chamar(messages, schema, dificuldade);
  }

  async extrairDeTexto({ texto, schema, instrucao, dificuldade }) {
    const messages = [
      { role: 'user', content: `${instrucao}\n\n--- CONTEÚDO ---\n${String(texto || '')}` },
    ];
    return this._chamar(messages, schema, dificuldade);
  }
}

module.exports = OpenAiProvider;
