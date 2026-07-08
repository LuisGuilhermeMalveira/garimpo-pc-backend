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

function auth(req, res, next) {
  const esperado = process.env.APP_TOKEN;
  if (!esperado) {
    return res.status(500).json({
      erro: 'APP_TOKEN não configurado no servidor (.env). Auth indisponível.',
    });
  }
  const token = extrairToken(req);
  if (!token || token !== esperado) {
    return res.status(401).json({ erro: 'Não autorizado: token ausente ou inválido.' });
  }
  req.userId = USUARIO_PADRAO;
  return next();
}

module.exports = { auth, USUARIO_PADRAO };
