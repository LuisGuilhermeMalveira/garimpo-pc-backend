'use strict';

/**
 * Triagem individual (a lupa) — Fase 2.
 *
 * POST /prospeccoes/analisar  (IA)  — parser + avaliador; devolve veredito completo (NÃO grava)
 * POST /prospeccoes                 — re-avalia (servidor é a verdade) e GRAVA
 * GET  /prospeccoes                 — lista (?status=)
 * GET  /prospeccoes/:id             — detalhe (itens + modificadores)
 * PATCH /prospeccoes/:id            — status comprei/passei + venda real
 * POST /prospeccoes/:id/simular     — recalcula removendo itens removíveis
 */

const express = require('express');
const { pool, query } = require('../db/pool');
const { upload, imagensDoRequest } = require('../middleware/upload');
const { uploadImagem, cloudinaryHabilitado } = require('../utils/cloudinary');
const parserAnuncio = require('../services/parserAnuncio');
const avaliador = require('../services/avaliador');
const leitorLink = require('../services/leitorLink');
const { fingerprint } = require('../utils/fingerprint');

const router = express.Router();

const STATUS_VALIDOS = ['analisado', 'negociando', 'comprei', 'passei'];

// specs principais (gpu/cpu) p/ fingerprint
function specsPrincipais(extracao) {
  return (extracao.pecas || [])
    .filter((p) => ['gpu', 'cpu'].includes(p.categoria))
    .map((p) => p.modelo)
    .filter(Boolean);
}

function motivoGarimpo(analise) {
  return analise.travas && analise.travas.length ? analise.travas.join(' ') : null;
}

// grava os itens e modificadores aplicados de uma prospecção (usado no criar e no editar)
async function inserirFilhos(client, prospeccaoId, a) {
  for (const it of a.itens) {
    await client.query(
      `INSERT INTO prospeccao_itens (
         prospeccao_id, categoria, modelo_extraido, modelo_incerto, peca_id, quantidade,
         preco_unitario, preco_aplicado, origem, peca_referencia_id, removivel, frescor_dias, faltante
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        prospeccaoId,
        it.categoria,
        it.modelo_extraido,
        it.modelo_incerto,
        it.peca_id,
        it.quantidade,
        it.preco_unitario,
        it.preco_aplicado,
        it.origem,
        it.peca_referencia_id,
        it.removivel,
        it.frescor_dias,
        it.faltante,
      ]
    );
  }
  for (const m of a.modificadores_aplicados) {
    await client.query(
      `INSERT INTO prospeccao_modificadores
         (prospeccao_id, modificador_id, nome, sentido, percentual, argumento)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [prospeccaoId, m.modificador_id, m.nome, m.sentido, m.percentual, m.argumento]
    );
  }
}

/**
 * POST /prospeccoes/analisar
 * Entrada: multipart "imagem" OU JSON { texto, tipo, origem, cidade_id }.
 */
router.post('/analisar', upload.array('imagem', 8), async (req, res, next) => {
  try {
    const b = req.body || {};
    let imagens = imagensDoRequest(req);
    let link = b.link || (b.tipo === 'link' ? b.conteudo : null) || null;
    let texto = b.texto || (b.tipo !== 'link' ? b.conteudo : null);

    // captura da extensão: o print já está no servidor; puxa daqui
    if (b.captura_id) {
      const cap = await query(
        'SELECT imagem_b64, mimetype, texto, link, origem FROM capturas WHERE id = $1 AND user_id = $2',
        [Number(b.captura_id), req.userId]
      );
      if (!cap.rows[0]) {
        return res.status(404).json({ erro: 'Captura não encontrada (expirou?). Garimpe a página de novo.' });
      }
      const c = cap.rows[0];
      imagens = [{ base64: c.imagem_b64, mimetype: c.mimetype, buffer: Buffer.from(c.imagem_b64, 'base64') }];
      texto = texto || c.texto || null;
      link = link || c.link || null;
      if (!b.origem && c.origem) b.origem = c.origem;
    }

    // modo LINK: tenta ler o anúncio pelo link (best-effort). O link é salvo de
    // qualquer jeito; se a leitura falhar, o erro já orienta a usar o print.
    if (b.tipo === 'link') {
      if (!link) return res.status(400).json({ erro: 'Informe o link do anúncio.' });
      try {
        texto = await leitorLink.lerLink(link);
      } catch (e) {
        return res.status(422).json({ erro: e.message, link_origem: link });
      }
    }

    if (!imagens.length && !texto) {
      return res.status(400).json({ erro: 'Envie print(s), texto ou link do anúncio.' });
    }

    const provEscolhido = ['anthropic', 'openai'].includes(b.provider) ? b.provider : undefined;
    const { extracao, provider } = await parserAnuncio.analisar({
      imagens,
      texto,
      origem: b.origem,
      provider: provEscolhido,
    });

    const opcoes = {};
    if (b.cidade_id) opcoes.cidade_id = Number(b.cidade_id);
    if (b.custo_recuperacao != null) opcoes.custo_recuperacao = Number(b.custo_recuperacao);
    if (Array.isArray(b.modificadores_off)) opcoes.modificadores_off = b.modificadores_off;

    const analise = await avaliador.avaliar({ extracao, userId: req.userId, opcoes });

    // sobe o 1º print pro Cloudinary (referência), se habilitado
    let imagem_url = null;
    if (imagens[0] && imagens[0].buffer && cloudinaryHabilitado()) {
      imagem_url = await uploadImagem(imagens[0].buffer, { folder: 'garimpo-pc/prospeccoes' });
    }

    res.json({
      provider,
      raw_extracao: extracao, // o cliente devolve isso no POST /prospeccoes pra gravar
      imagem_url,
      link_origem: link,
      analise,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /prospeccoes/reavaliar — recalcula a partir de raw_extracao SEM IA e SEM gravar.
 * Pra "simular sem removíveis", trocar cidade ou ajustar recuperação na hora.
 * Body: { raw_extracao, cidade_id?, excluir_removiveis?, custo_recuperacao? }
 */
router.post('/reavaliar', async (req, res, next) => {
  try {
    const b = req.body || {};
    const extracao = b.raw_extracao;
    if (!extracao || !Array.isArray(extracao.pecas)) {
      return res.status(400).json({ erro: 'raw_extracao (com pecas) é obrigatório.' });
    }
    const opcoes = {};
    if (b.cidade_id) opcoes.cidade_id = Number(b.cidade_id);
    if (b.excluir_removiveis != null) opcoes.excluir_removiveis = !!b.excluir_removiveis;
    if (b.custo_recuperacao != null) opcoes.custo_recuperacao = Number(b.custo_recuperacao);
    if (Array.isArray(b.modificadores_off)) opcoes.modificadores_off = b.modificadores_off;
    const analise = await avaliador.avaliar({ extracao, userId: req.userId, opcoes });
    res.json({ analise });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /prospeccoes — grava. Re-avalia a partir de raw_extracao (servidor manda).
 * Body: { raw_extracao, titulo?, origem?, cidade_id?, link_origem?, imagem_url?, custo_recuperacao? }
 */
router.post('/', async (req, res, next) => {
  // mesmo link = mesmo anúncio: ATUALIZA a prospecção existente em vez de
  // duplicar (garimpar de novo pela extensão refresca preço/peças/veredito).
  try {
    const link = req.body && req.body.link_origem;
    if (link) {
      const dup = await query(
        `SELECT id FROM prospeccoes
          WHERE user_id = $1 AND link_origem = $2
          ORDER BY id DESC LIMIT 1`,
        [req.userId, link]
      );
      if (dup.rows[0]) {
        req.params.id = String(dup.rows[0].id);
        return atualizarProspeccao(req, res, next);
      }
    }
  } catch (err) {
    return next(err);
  }

  const client = await pool.connect();
  try {
    const b = req.body || {};
    const extracao = b.raw_extracao;
    if (!extracao || !Array.isArray(extracao.pecas)) {
      return res.status(400).json({ erro: 'raw_extracao (com pecas) é obrigatório. Rode /analisar antes.' });
    }
    if (b.origem) extracao.origem = b.origem;

    const opcoes = {};
    if (b.cidade_id) opcoes.cidade_id = Number(b.cidade_id);
    if (b.custo_recuperacao != null) opcoes.custo_recuperacao = Number(b.custo_recuperacao);
    if (Array.isArray(b.modificadores_off)) opcoes.modificadores_off = b.modificadores_off;

    const a = await avaliador.avaliar({ extracao, userId: req.userId, opcoes });

    const titulo = b.titulo || extracao.titulo || null;
    const fp = fingerprint({
      titulo,
      preco_pedido: extracao.preco_pedido,
      cidade: extracao.cidade,
      specs: specsPrincipais(extracao),
    });
    const possivel_garimpo = a.veredito === 'marginal' && a.travas.length > 0;

    await client.query('BEGIN');

    const ins = await client.query(
      `INSERT INTO prospeccoes (
         user_id, titulo, origem, cidade_id, preco_pedido, preco_pix, tem_entrega, valor_entrega,
         valor_bruto_pecas, valor_modificado, valor_revenda, custo_aquisicao, custo_recuperacao,
         margem_risco, lucro_liquido, dias_ate_vender, lucro_por_mes, valor_canibalizado,
         preco_teto, preco_oferta, score_confianca, possivel_garimpo, motivo_garimpo, fingerprint,
         veredito, imagem_url, link_origem, telefone, raw_extracao, argumentos, status
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,
         $9,$10,$11,$12,$13,
         $14,$15,$16,$17,$18,
         $19,$20,$21,$22,$23,$24,
         $25,$26,$27,$28,$29,$30,'analisado'
       ) RETURNING id`,
      [
        req.userId,
        titulo,
        extracao.origem || 'olx',
        a.cidade ? a.cidade.id : null,
        a.preco_pedido,
        a.preco_pix,
        a.tem_entrega,
        Number(extracao.valor_entrega) || null,
        a.valor_bruto_pecas,
        a.valor_modificado,
        a.valor_revenda,
        a.custo_aquisicao,
        a.custo_recuperacao,
        a.margem_risco,
        a.lucro_liquido,
        a.dias_ate_vender,
        a.lucro_por_mes,
        a.canibalizacao.valor_canibalizado,
        a.negociacao.preco_teto,
        a.negociacao.preco_oferta,
        a.score.valor,
        possivel_garimpo,
        motivoGarimpo(a),
        fp,
        a.veredito,
        b.imagem_url || null,
        b.link_origem || null,
        b.telefone || extracao.telefone || null,
        JSON.stringify(extracao),
        JSON.stringify(a.negociacao.argumentos || []),
      ]
    );
    const prospeccaoId = ins.rows[0].id;
    await inserirFilhos(client, prospeccaoId, a);

    await client.query('COMMIT');
    res.status(201).json({ id: prospeccaoId, veredito: a.veredito, analise: a });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

/**
 * PUT /prospeccoes/:id — re-avalia a partir de raw_extracao (editado) e ATUALIZA
 * a mesma prospecção (itens/modificadores são regravados). Pra ajustar o PC
 * depois de conversar com o vendedor (add/remover/especificar peças).
 */
async function atualizarProspeccao(req, res, next) {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    const b = req.body || {};
    const extracao = b.raw_extracao;
    if (!extracao || !Array.isArray(extracao.pecas)) {
      return res.status(400).json({ erro: 'raw_extracao (com pecas) é obrigatório.' });
    }
    if (b.origem) extracao.origem = b.origem;

    const opcoes = {};
    if (b.cidade_id) opcoes.cidade_id = Number(b.cidade_id);
    if (b.custo_recuperacao != null) opcoes.custo_recuperacao = Number(b.custo_recuperacao);
    if (Array.isArray(b.modificadores_off)) opcoes.modificadores_off = b.modificadores_off;

    const a = await avaliador.avaliar({ extracao, userId: req.userId, opcoes });
    const titulo = b.titulo || extracao.titulo || null;
    const fp = fingerprint({
      titulo,
      preco_pedido: extracao.preco_pedido,
      cidade: extracao.cidade,
      specs: specsPrincipais(extracao),
    });
    const possivel_garimpo = a.veredito === 'marginal' && a.travas.length > 0;

    await client.query('BEGIN');
    const upd = await client.query(
      `UPDATE prospeccoes SET
         titulo=$2, origem=$3, cidade_id=$4, preco_pedido=$5, preco_pix=$6, tem_entrega=$7, valor_entrega=$8,
         valor_bruto_pecas=$9, valor_modificado=$10, valor_revenda=$11, custo_aquisicao=$12, custo_recuperacao=$13,
         margem_risco=$14, lucro_liquido=$15, dias_ate_vender=$16, lucro_por_mes=$17, valor_canibalizado=$18,
         preco_teto=$19, preco_oferta=$20, score_confianca=$21, possivel_garimpo=$22, motivo_garimpo=$23, fingerprint=$24,
         veredito=$25, link_origem=COALESCE($26, link_origem), telefone=COALESCE($27, telefone),
         raw_extracao=$28, argumentos=$29
       WHERE id=$1 AND user_id=$30 RETURNING id`,
      [
        id,
        titulo,
        extracao.origem || 'olx',
        a.cidade ? a.cidade.id : null,
        a.preco_pedido,
        a.preco_pix,
        a.tem_entrega,
        Number(extracao.valor_entrega) || null,
        a.valor_bruto_pecas,
        a.valor_modificado,
        a.valor_revenda,
        a.custo_aquisicao,
        a.custo_recuperacao,
        a.margem_risco,
        a.lucro_liquido,
        a.dias_ate_vender,
        a.lucro_por_mes,
        a.canibalizacao.valor_canibalizado,
        a.negociacao.preco_teto,
        a.negociacao.preco_oferta,
        a.score.valor,
        possivel_garimpo,
        motivoGarimpo(a),
        fp,
        a.veredito,
        b.link_origem || null,
        b.telefone || null,
        JSON.stringify(extracao),
        JSON.stringify(a.negociacao.argumentos || []),
        req.userId,
      ]
    );
    if (upd.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ erro: 'Prospecção não encontrada.' });
    }
    await client.query('DELETE FROM prospeccao_itens WHERE prospeccao_id = $1', [id]);
    await client.query('DELETE FROM prospeccao_modificadores WHERE prospeccao_id = $1', [id]);
    await inserirFilhos(client, id, a);

    await client.query('COMMIT');
    res.json({ id, veredito: a.veredito, analise: a, atualizado: true });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

router.put('/:id', atualizarProspeccao);

// GET /prospeccoes (?status=)
router.get('/', async (req, res, next) => {
  try {
    const params = [req.userId];
    let where = 'WHERE user_id = $1';
    if (STATUS_VALIDOS.includes(req.query.status)) {
      params.push(req.query.status);
      where += ` AND status = $${params.length}`;
    }
    const { rows } = await query(
      `SELECT id, titulo, origem, cidade_id, preco_pedido, preco_pix, veredito, lucro_liquido,
              lucro_por_mes, dias_ate_vender, preco_teto, preco_oferta, score_confianca,
              possivel_garimpo, motivo_garimpo, link_origem, telefone, imagem_url, status, criado_em
         FROM prospeccoes ${where}
        ORDER BY criado_em DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /prospeccoes/:id
router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const p = await query('SELECT * FROM prospeccoes WHERE id = $1 AND user_id = $2', [id, req.userId]);
    if (p.rows.length === 0) return res.status(404).json({ erro: 'Prospecção não encontrada.' });
    const itens = await query(
      'SELECT * FROM prospeccao_itens WHERE prospeccao_id = $1 ORDER BY id',
      [id]
    );
    const mods = await query(
      'SELECT * FROM prospeccao_modificadores WHERE prospeccao_id = $1 ORDER BY id',
      [id]
    );
    res.json({ ...p.rows[0], itens: itens.rows, modificadores: mods.rows });
  } catch (err) {
    next(err);
  }
});

// PATCH /prospeccoes/:id  (comprei/passei + venda real)
router.patch('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (req.body && req.body.status && !STATUS_VALIDOS.includes(req.body.status)) {
      return res.status(400).json({ erro: `status deve ser: ${STATUS_VALIDOS.join(' | ')}` });
    }
    const sets = [];
    const vals = [];
    let i = 1;
    for (const c of ['status', 'preco_venda_real', 'titulo', 'telefone']) {
      if (req.body && req.body[c] !== undefined) {
        sets.push(`${c} = $${i++}`);
        vals.push(req.body[c]);
      }
    }
    if (sets.length === 0) return res.status(400).json({ erro: 'Nada para atualizar.' });
    vals.push(id, req.userId);
    const { rows } = await query(
      `UPDATE prospeccoes SET ${sets.join(', ')}
        WHERE id = $${i++} AND user_id = $${i} RETURNING *`,
      vals
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Prospecção não encontrada.' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /prospeccoes/:id — remove a prospecção (itens e modificadores caem em cascata)
router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rowCount } = await query('DELETE FROM prospeccoes WHERE id = $1 AND user_id = $2', [
      id,
      req.userId,
    ]);
    if (rowCount === 0) return res.status(404).json({ erro: 'Prospecção não encontrada.' });
    res.json({ ok: true, id });
  } catch (err) {
    next(err);
  }
});

// POST /prospeccoes/:id/simular — recalcula sem os itens removíveis
router.post('/:id/simular', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const p = await query(
      'SELECT raw_extracao, cidade_id FROM prospeccoes WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    );
    if (p.rows.length === 0) return res.status(404).json({ erro: 'Prospecção não encontrada.' });

    const extracao = p.rows[0].raw_extracao;
    if (!extracao) return res.status(409).json({ erro: 'Prospecção sem extração salva.' });

    const opcoes = { excluir_removiveis: true };
    if (p.rows[0].cidade_id) opcoes.cidade_id = p.rows[0].cidade_id;
    if (req.body && req.body.custo_recuperacao != null)
      opcoes.custo_recuperacao = Number(req.body.custo_recuperacao);
    if (req.body && Array.isArray(req.body.modificadores_off))
      opcoes.modificadores_off = req.body.modificadores_off;

    const analise = await avaliador.avaliar({ extracao, userId: req.userId, opcoes });
    res.json({ id, sem_removiveis: true, analise });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
