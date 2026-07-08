'use strict';

/**
 * Rótulo genérico por categoria — usado quando o anúncio (ou o Luís) não dá
 * o modelo da peça. Em vez de ficar sem nome, mostra o nome do "bagulho":
 * "Fonte", "Placa-mãe", "SSD"…
 */

const GENERICOS = {
  gpu: 'Placa de vídeo',
  cpu: 'Processador',
  mobo: 'Placa-mãe',
  ram: 'Memória RAM',
  fonte: 'Fonte',
  ssd: 'SSD',
  hd: 'HD',
  cooler: 'Cooler',
  gabinete: 'Gabinete',
  monitor: 'Monitor',
  periferico: 'Periférico',
  outro: 'Peça',
};

function rotuloGenerico(categoria) {
  return GENERICOS[categoria] || 'Peça';
}

module.exports = { GENERICOS, rotuloGenerico };
