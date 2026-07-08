'use strict';

/**
 * Contrato único da camada de IA (padrão ProvaDoc: saída JSON estrita,
 * parse seguro). Todo provider implementa esta interface; os serviços
 * (calibrador, parserAnuncio, parserLote...) NÃO sabem qual provider está
 * ativo — só conhecem estes dois métodos.
 *
 *   extrairDeImagem({ imagem, schema, instrucao, dificuldade }) -> objeto JSON
 *   extrairDeTexto ({ texto,  schema, instrucao, dificuldade }) -> objeto JSON
 *
 * Formatos:
 *   imagem      = { base64: string, mimetype: string }  (ex.: image/png)
 *   schema      = JSON Schema do objeto esperado (usado p/ structured outputs
 *                 no OpenAI; vira reforço de prompt no Anthropic)
 *   instrucao   = texto pedindo o JSON
 *   dificuldade = 'rapido' (lote/barato) | 'dificil' (leitura difícil)  [opcional]
 *
 * Retorno: objeto já parseado. Em erro de parse, lança AiParseError.
 */

class AiParseError extends Error {
  constructor(message, raw) {
    super(message);
    this.name = 'AiParseError';
    this.raw = raw;
  }
}

/**
 * Classe-base. Providers estendem e implementam os dois métodos.
 * Mantida como contrato explícito (em vez de só JSDoc) pra falhar cedo
 * se um provider esquecer de implementar.
 */
class AiProvider {
  /** Nome curto do provider ('anthropic' | 'openai'). */
  get nome() {
    throw new Error('AiProvider.nome não implementado');
  }

  // eslint-disable-next-line no-unused-vars
  async extrairDeImagem({ imagem, schema, instrucao, dificuldade }) {
    throw new Error(`${this.nome}: extrairDeImagem() não implementado`);
  }

  // eslint-disable-next-line no-unused-vars
  async extrairDeTexto({ texto, schema, instrucao, dificuldade }) {
    throw new Error(`${this.nome}: extrairDeTexto() não implementado`);
  }
}

/**
 * Parse seguro de JSON vindo do modelo:
 * - remove cercas ```json ... ``` se existirem;
 * - recorta do primeiro { (ou [) até o último } (ou ]) como fallback;
 * - lança AiParseError com o texto cru se nada funcionar.
 */
function parseJsonSeguro(textoBruto) {
  if (textoBruto == null) {
    throw new AiParseError('Resposta vazia do modelo', textoBruto);
  }
  let s = String(textoBruto).trim();

  // tira cercas de código
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }

  // tentativa direta
  try {
    return JSON.parse(s);
  } catch (_) {
    // fallback: recorta do primeiro delimitador ao último
    const inicioObj = s.indexOf('{');
    const inicioArr = s.indexOf('[');
    let inicio = -1;
    let fimChar = '}';
    if (inicioArr !== -1 && (inicioObj === -1 || inicioArr < inicioObj)) {
      inicio = inicioArr;
      fimChar = ']';
    } else if (inicioObj !== -1) {
      inicio = inicioObj;
      fimChar = '}';
    }
    if (inicio !== -1) {
      const fim = s.lastIndexOf(fimChar);
      if (fim > inicio) {
        const recorte = s.slice(inicio, fim + 1);
        try {
          return JSON.parse(recorte);
        } catch (_e) {
          /* cai pro throw abaixo */
        }
      }
    }
    throw new AiParseError('Não consegui parsear JSON da resposta do modelo', textoBruto);
  }
}

module.exports = { AiProvider, AiParseError, parseJsonSeguro };
