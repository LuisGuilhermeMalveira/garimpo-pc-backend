'use strict';

/**
 * Parser de anúncio — usa a camada de IA pra extrair specs + sinais de um PC.
 * Entrada: print (imagem) ou texto. Saída: objeto do schema `parser`.
 *
 * Não decide nada — só lê. A interpretação (decompor, casar, veredito) é do avaliador.
 */

const ai = require('../ai');
const { bufferUnicoRedimensionado } = require('../utils/imagem');
const { rotuloGenerico } = require('../utils/genericos');

function rotularGenericos(pecas, sinais) {
  for (const p of pecas) {
    const semModelo = !p.modelo || String(p.modelo).trim() === '';
    if (semModelo) {
      p.modelo = rotuloGenerico(p.categoria);
      p.modelo_incerto = true;
    }
    // fonte sem marca declarada nos sinais -> deixa explícito "genérica"
    if (p.categoria === 'fonte' && sinais && sinais.fonte_sem_marca && !/gen[eé]rica/i.test(p.modelo)) {
      p.modelo = `${p.modelo} (genérica)`;
    }
  }
  return pecas;
}

/**
 * @param {Object} opts
 * @param {{base64,mimetype}} [opts.imagem]
 * @param {string} [opts.texto]
 * @param {string} [opts.origem] - 'olx'|'facebook'|'outro' (override)
 * @returns {Promise<{extracao: Object, provider: string}>}
 */
async function analisar({ imagem, imagens, texto, origem, provider: providerOverride } = {}) {
  const lista = imagens && imagens.length ? imagens : imagem ? [imagem] : [];
  if (lista.length === 0 && texto == null) {
    throw new Error('parserAnuncio: forneça imagem(ns) (print) ou texto.');
  }
  const provider = providerOverride || ai.resolverNomeProvider('parser');
  // cada print é reduzido pra caber no limite de visão; manda todos juntos numa análise só
  const imgsFinal = await Promise.all(
    lista.map((im) => (im && im.buffer ? bufferUnicoRedimensionado(im.buffer) : im))
  );
  const extracao = await ai.executarTarefa({
    tarefa: 'parser',
    imagens: imgsFinal.length ? imgsFinal : undefined,
    texto,
    providerNome: provider,
  });

  // saneamento mínimo + defaults seguros
  extracao.pecas = Array.isArray(extracao.pecas) ? extracao.pecas : [];
  extracao.sinais = extracao.sinais || {};
  rotularGenericos(extracao.pecas, extracao.sinais);
  if (origem) extracao.origem = origem;
  if (!extracao.origem) extracao.origem = 'olx';

  return { extracao, provider };
}

module.exports = { analisar };
