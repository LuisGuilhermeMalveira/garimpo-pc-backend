'use strict';

/**
 * Prompts compartilhados pelas tarefas de IA.
 * Cada tarefa expõe { instrucao, schema, dificuldade }.
 * O schema é JSON Schema — usado como structured output no OpenAI e
 * como reforço de prompt no Anthropic.
 *
 * Na Fase 1 só o calibrador é exercitado de ponta a ponta
 * (/precos-base/calibrar). Parser e lote já ficam definidos pra
 * alimentar /ai/comparar e as Fases 2/3 sem reescrever a camada.
 */

// ---------- CALIBRADOR (print de busca -> lista de preços) ----------
const calibrador = {
  dificuldade: 'rapido',
  instrucao: [
    'Você recebe um PRINT de uma página de busca de marketplace (OLX/Facebook),',
    'geralmente ordenada por menor preço, com vários anúncios.',
    'O objetivo é calibrar o preço de UMA PEÇA AVULSA específica.',
    'Liste os preços de VENDA visíveis APENAS dos anúncios que vendem a PEÇA SOZINHA.',
    'Regras CRÍTICAS:',
    '- IGNORE anúncios de PCs/computadores/setups MONTADOS que apenas CONTÊM a peça',
    '  (se o título cita CPU+placa-mãe+gabinete, ou diz "PC Gamer", "Computador", "Setup", é um PC montado — NÃO conte).',
    '- Pegue só a peça avulsa (ex.: a placa de vídeo sozinha, o processador sozinho).',
    '- Ignore valores de parcela ("12x de R$..."), frete e descontos — quero o preço cheio/à vista.',
    '- Não invente preços que não estejam legíveis.',
    '- Responda SOMENTE com JSON no formato pedido, sem texto fora do JSON.',
  ].join('\n'),
  schema: {
    name: 'calibracao_precos',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        precos: {
          type: 'array',
          description: 'Preços de venda lidos, em reais, como números.',
          items: { type: 'number' },
        },
        observacoes: {
          type: 'string',
          description: 'Observações curtas (ex.: print borrado, poucos anúncios).',
        },
      },
      required: ['precos', 'observacoes'],
    },
  },
};

// ---------- PARSER DE ANÚNCIO (print/texto -> specs + sinais) ----------
const parser = {
  dificuldade: 'dificil',
  instrucao: [
    'Você recebe um anúncio de PC usado (print(s) ou texto) de OLX/Facebook.',
    'Podem vir VÁRIAS imagens: são páginas/prints do MESMO anúncio (foto com specs,',
    'descrição, preço...). Combine TODAS numa única extração — não trate como PCs diferentes.',
    'Extraia as peças e os sinais conforme o schema. Regras:',
    '- LEIA TODO TEXTO VISÍVEL, inclusive o que estiver ESCRITO DENTRO DAS FOTOS do anúncio',
    '  (vendedores põem a ficha técnica/specs como banner na própria imagem do PC) — não só a descrição.',
    '- Distinga preço TOTAL de PARCELA (nunca confunda "6x de R$450" com o total).',
    '- preco_pix é o valor à vista/Pix, se houver.',
    '- titulo = o título/nome do anúncio (ex.: "PC Gamer RTX 4060 8GB + i5-10400F"). Se não houver, null.',
    '- telefone = telefone/WhatsApp do vendedor se aparecer no anúncio (ex.: "(38) 98834-4186"); senão null.',
    '- modelo = NOME CANÔNICO/SIMPLIFICADO da peça, SEM marca e SEM sufixo de SKU. Use:',
    '  GPU -> chip + variante + VRAM. Ex.: "Asus Dual RTX 3060 Ti OC 8GB"=>"RTX 3060 Ti 8GB"; "Sapphire RX 580 8GB Nitro"=>"RX 580 8GB".',
    '  Placa-mãe -> "Placa-mãe" + CHIPSET. Ex.: "Gigabyte B550M Aorus Elite"=>"Placa-mãe B550"; "Asus Prime A320M-K"=>"Placa-mãe A320".',
    '  CPU -> só o modelo. Ex.: "AMD Ryzen 5 5600 OEM"=>"Ryzen 5 5600"; "Intel Core i5-10400F"=>"i5-10400F".',
    '  RAM -> "Memória" + capacidade + DDR (sem marca). Ex.: "Kingston Fury 8GB DDR4 3200"=>"Memória 8GB DDR4".',
    '  SSD/HD -> tipo + capacidade. Ex.: "SSD Kingston A400 480GB"=>"SSD 480GB"; "HD Seagate 1TB"=>"HD 1TB".',
    '  Fonte -> "Fonte" + potência (+ selo se houver). Ex.: "Corsair CX600 80 Plus"=>"Fonte 600W".',
    '- Marque modelo_incerto=true quando faltar o modelo exato (ex.: "Ryzen 5" sem número).',
    '- SEMPRE inclua o gabinete (categoria "gabinete") se aparecer, mesmo sem marca.',
    '- Inclua monitor (categoria "monitor") e periféricos como teclado/mouse/headset',
    '  (categoria "periferico") SE vierem no anúncio — sempre com removivel=true.',
    '- Marque removivel=true em monitor/periférico/qualquer item que dá pra tirar da oferta.',
    '- SEMPRE coloque a capacidade no MODELO também (não só no campo capacidade):',
    '  RAM -> modelo "16GB DDR4 (2x8)"; SSD -> modelo "SSD 480GB"; HD -> modelo "HD 1TB".',
    '- RAM: capacidade = total em GB; quantidade = nº de pentes se informado.',
    '  Ex.: "16GB (2x8)" -> quantidade 2, capacidade 8. "32GB" sem detalhe -> capacidade 32, quantidade 1.',
    '  Se for de NOTEBOOK (SODIMM/notebook), escreva "notebook" no modelo da RAM.',
    '- SSD/HD: capacidade SEMPRE em GB (1TB=1024, 2TB=2048, 500GB=500, 480GB=480, 240GB=240). Nunca deixe null.',
    '  Diferencie SSD de HD pela categoria: "SSD"/"NVMe"/"M.2" é ssd; "HD"/"disco rígido"/"7200rpm" é hd.',
    '- Responda SOMENTE com JSON.',
  ].join('\n'),
  schema: {
    name: 'parser_anuncio',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        titulo: { type: ['string', 'null'] },
        telefone: { type: ['string', 'null'] },
        pecas: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              categoria: {
                type: 'string',
                enum: [
                  'gpu',
                  'cpu',
                  'mobo',
                  'ram',
                  'fonte',
                  'ssd',
                  'hd',
                  'cooler',
                  'gabinete',
                  'monitor',
                  'periferico',
                  'outro',
                ],
              },
              modelo: { type: 'string' },
              modelo_incerto: { type: 'boolean' },
              quantidade: { type: ['integer', 'null'] },
              capacidade: { type: ['integer', 'null'] },
              removivel: { type: 'boolean' },
            },
            required: ['categoria', 'modelo', 'modelo_incerto', 'quantidade', 'capacidade', 'removivel'],
          },
        },
        preco_pedido: { type: ['number', 'null'] },
        preco_pix: { type: ['number', 'null'] },
        cidade: { type: ['string', 'null'] },
        tem_entrega: { type: 'boolean' },
        valor_entrega: { type: ['number', 'null'] },
        origem: { type: 'string', enum: ['olx', 'facebook', 'outro'] },
        sinais: {
          type: 'object',
          additionalProperties: false,
          properties: {
            fonte_sem_marca: { type: 'boolean' },
            possivel_mineracao: { type: 'boolean' },
            plataforma_morta: { type: 'boolean' },
            slots_ram_cheios: { type: 'boolean' },
            falta_foto_rodando: { type: 'boolean' },
            gabinete_estado: { type: 'string' },
            na_garantia: { type: 'boolean' },
            water_cooler: { type: 'boolean' },
          },
          required: [
            'fonte_sem_marca',
            'possivel_mineracao',
            'plataforma_morta',
            'slots_ram_cheios',
            'falta_foto_rodando',
            'gabinete_estado',
            'na_garantia',
            'water_cooler',
          ],
        },
      },
      required: ['titulo', 'telefone', 'pecas', 'preco_pedido', 'preco_pix', 'cidade', 'tem_entrega', 'valor_entrega', 'origem', 'sinais'],
    },
  },
};

// ---------- PARSER DE LOTE (print de busca -> lista de PCs) ----------
const lote = {
  dificuldade: 'rapido',
  instrucao: [
    'Você recebe um PRINT de página de busca da OLX/Facebook com VÁRIOS PCs (anúncios diferentes).',
    'Para CADA anúncio visível, extraia conforme o schema. Regras:',
    '- Ignore valores de parcela; quero o preço cheio.',
    '- Não invente cidade/preço que não estejam legíveis — use null.',
    '- peca_principal = a peça que define o valor (geralmente a GPU/CPU).',
    '- Responda SOMENTE com JSON.',
  ].join('\n'),
  schema: {
    name: 'parser_lote',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        pcs: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              titulo: { type: ['string', 'null'] },
              preco_pedido: { type: ['number', 'null'] },
              cidade: { type: ['string', 'null'] },
              peca_principal: { type: ['string', 'null'] },
              tem_entrega: { type: 'boolean' },
              link_se_visivel: { type: ['string', 'null'] },
            },
            required: ['titulo', 'preco_pedido', 'cidade', 'peca_principal', 'tem_entrega', 'link_se_visivel'],
          },
        },
      },
      required: ['pcs'],
    },
  },
};

const TAREFAS = { calibrador, parser, lote };

/**
 * Retorna o prompt de uma tarefa ('calibrador' | 'parser' | 'lote').
 */
function getPrompt(tarefa) {
  const p = TAREFAS[tarefa];
  if (!p) {
    throw new Error(`Tarefa de IA desconhecida: "${tarefa}". Use: ${Object.keys(TAREFAS).join(', ')}`);
  }
  return p;
}

module.exports = { TAREFAS, getPrompt, calibrador, parser, lote };
