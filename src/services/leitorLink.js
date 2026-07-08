'use strict';

/**
 * Leitor best-effort de link de anúncio (ARQUITETURA.md: "link é tentativa").
 * OLX/Facebook bloqueiam bots, então isto NÃO é confiável: tenta pegar
 * og:title/og:description, JSON-LD e algum texto visível. Se vier pouco,
 * lança erro pedindo o print. O link em si é sempre SALVO (não depende disto).
 */

function pegaMeta(html, prop) {
  // tenta property="..." content="..." e a ordem invertida
  const res = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'),
  ];
  for (const re of res) {
    const m = html.match(re);
    if (m) return m[1];
  }
  return '';
}

function extrairTexto(html) {
  const partes = [];
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (title) partes.push(title[1]);
  partes.push(pegaMeta(html, 'og:title'));
  partes.push(pegaMeta(html, 'og:description'));
  partes.push(pegaMeta(html, 'description'));

  // JSON-LD (OLX às vezes traz Product/offers com preço)
  const lds = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of lds) {
    try {
      partes.push(JSON.stringify(JSON.parse(m[1])));
    } catch (_) {
      /* ignora ld inválido */
    }
  }

  // fallback: texto visível (limitado)
  const corpo = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ');
  partes.push(corpo.slice(0, 4000));

  return partes
    .filter(Boolean)
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 6000);
}

/**
 * @param {string} url
 * @returns {Promise<string>} texto extraído (pra alimentar o parser)
 * @throws {Error} mensagem amigável quando o link não entrega conteúdo
 */
async function lerLink(url) {
  if (!/^https?:\/\//i.test(String(url || ''))) {
    throw new Error('Link inválido (precisa começar com http:// ou https://).');
  }
  let res;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });
  } catch (_) {
    throw new Error('Não consegui acessar o link (tempo esgotado/conexão). Use o print.');
  }
  if (!res.ok) {
    throw new Error(`O site respondeu ${res.status} (provável bloqueio anti-bot). Use o print.`);
  }
  const html = await res.text();
  const texto = extrairTexto(html);
  if (texto.length < 40) {
    throw new Error('O link não entregou conteúdo legível (bloqueio anti-bot). Use o print.');
  }
  return texto;
}

module.exports = { lerLink, extrairTexto };
