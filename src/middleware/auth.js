'use strict';

/**
 * Auth por token simples (Bearer), single-user, pronto p/ virar JWT.
 *
 * Compara o token enviado com APP_TOKEN do ambiente. Como o app é
 * single-user, todo request autenticado opera como o usuário 1 (Luís) —
 * `req.userId` já fica setado pra quando o schema multi-tenant for ligado.
 *
 * Aceita o token em:
 *   - Authorization: Bearer <token>
 *   - x-app-token: <token>
 *   - ?token=<token>  (conveniência p/ Share Target / testes)
 */

const USUARIO_PADRAO = 1;

function extrairToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  if (req.headers['x-app-token']) {
    return String(req.headers['x-app-token']).trim();
  }
  if (req.query && req.query.token) {
    return String(req.query.token).trim();
  }
  return null;
}

// tokens aceitos: APP_TOKEN (Luís) + APP_TOKENS_EXTRAS (lista separada por
// vírgula — amigos testando). TODOS operam na MESMA conta (user 1) por
// enquanto; conta separada é a fase multi-tenant.
function tokensValidos() {
  const lista = [process.env.APP_TOKEN];
  const extras = process.env.APP_TOKENS_EXTRAS || '';
  for (const t of extras.split(',')) {
    const limpo = t.trim();
    if (limpo) lista.push(limpo);
  }
  return lista.filter(Boolean);
}

function auth(req, res, next) {
  const validos = tokensValidos();
  if (validos.length === 0) {
    return res.status(500).json({
      erro: 'APP_TOKEN não configurado no servidor (.env). Auth indisponível.',
    });
  }
  const token = extrairToken(req);
  if (!token || !validos.includes(token)) {
    return res.status(401).json({ erro: 'Não autorizado: token ausente ou inválido.' });
  }
  req.userId = USUARIO_PADRAO;
  return next();
}

module.exports = { auth, USUARIO_PADRAO };
