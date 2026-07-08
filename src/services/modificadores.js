'use strict';

/**
 * Modificadores — converte os SINAIS do anúncio (e sinais derivados das peças)
 * em ajustes percentuais do banco, aplica e gera os argumentos de barganha.
 *
 * `valor_modificado = valor_bruto × (1 + Σ sentido·percentual)`
 * onde sentido 'sobe' soma e 'desce' subtrai.
 *
 * Cada modificador 'desce' com argumento vira munição de negociação.
 *
 * O casamento sinal→modificador é por PALAVRA-CHAVE no nome do modificador
 * (robusto a pequenas edições do Luís). Modificador inexistente é ignorado.
 */

const { normalizar } = require('../utils/texto');

// quais palavras-chave identificam cada modificador-alvo no catálogo
const CHAVES = {
  fonte_generica: ['generica'],
  mineracao: ['mineracao'],
  plataforma_morta: ['plataforma morta'],
  sem_foto: ['sem foto'],
  slots_cheios: ['slots ram'],
  gabinete_ruim: ['gabinete velho', 'velho feio'],
  garantia: ['garantia'],
  gabinete_bom: ['gabinete branco', 'branco vidro'],
  water_cooler: ['water'],
  upgrade_path: ['upgrade', 'b550', 'b450'],
  fonte_folga: ['fonte com folga', 'com folga'],
};

function achar(modificadores, chaveList) {
  return (
    modificadores.find((m) => {
      const n = normalizar(m.nome);
      return chaveList.some((k) => n.includes(normalizar(k)));
    }) || null
  );
}

// ---- detecção de sinais derivados das peças ----
function temUpgradePath(pecas) {
  return (pecas || []).some(
    (p) => p.categoria === 'mobo' && /b450|b550/i.test(p.modelo || p.modelo_extraido || '')
  );
}
function temFonteFolga(pecas, sinais) {
  if (sinais && sinais.fonte_sem_marca) return false; // sem marca não conta como folga
  return (pecas || []).some((p) => {
    if (p.categoria !== 'fonte') return false;
    const m = (p.modelo || p.modelo_extraido || '').match(/(\d{3,4})\s*w/i);
    return m && Number(m[1]) >= 650;
  });
}
function gabineteEhRuim(estado) {
  return /amarel|velho|antig|sem vidro|feio|datad/i.test(String(estado || ''));
}
function gabineteEhBom(estado) {
  return /branc|vidro|bonit|gamer|novo/i.test(String(estado || ''));
}

/**
 * Aplica os modificadores ativos a partir dos sinais e das peças.
 * @param {Object} sinais - do parser
 * @param {Array} pecas - peças cruas do parser (pra sinais derivados)
 * @param {Array} modificadores - linhas ativas do banco
 * @returns {{ aplicados: Array, soma_percentual: number }}
 */
function aplicar(sinais, pecas, modificadores, desativados = []) {
  const s = sinais || {};
  const ativos = (modificadores || []).filter((m) => m.ativo !== false);
  // nomes desligados nesta análise (Luís decidiu não aplicar)
  const off = new Set((desativados || []).map((n) => normalizar(n)));
  const aplicados = [];
  const usados = new Set();

  function add(mod) {
    if (!mod || usados.has(mod.id)) return;
    if (off.has(normalizar(mod.nome))) return; // desligado nesta triagem
    usados.add(mod.id);
    aplicados.push({
      modificador_id: mod.id,
      nome: mod.nome,
      sentido: mod.sentido,
      percentual: Number(mod.percentual),
      argumento: mod.argumento || null,
    });
  }

  if (s.fonte_sem_marca) add(achar(ativos, CHAVES.fonte_generica));
  if (s.possivel_mineracao) add(achar(ativos, CHAVES.mineracao));
  if (s.plataforma_morta) add(achar(ativos, CHAVES.plataforma_morta));
  if (s.falta_foto_rodando) add(achar(ativos, CHAVES.sem_foto));
  if (s.slots_ram_cheios) add(achar(ativos, CHAVES.slots_cheios));
  if (s.na_garantia) add(achar(ativos, CHAVES.garantia));
  if (s.water_cooler) add(achar(ativos, CHAVES.water_cooler));

  if (gabineteEhRuim(s.gabinete_estado)) add(achar(ativos, CHAVES.gabinete_ruim));
  else if (gabineteEhBom(s.gabinete_estado)) add(achar(ativos, CHAVES.gabinete_bom));

  if (temUpgradePath(pecas)) add(achar(ativos, CHAVES.upgrade_path));
  if (temFonteFolga(pecas, s)) add(achar(ativos, CHAVES.fonte_folga));

  const soma_percentual = aplicados.reduce(
    (acc, m) => acc + (m.sentido === 'sobe' ? m.percentual : -m.percentual),
    0
  );

  return { aplicados, soma_percentual: Math.round(soma_percentual * 1000) / 1000 };
}

module.exports = { aplicar, temUpgradePath, temFonteFolga };
