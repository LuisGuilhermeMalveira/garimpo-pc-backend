-- Anti-duplicata de calibração: hash (sha256) de cada print já processado.
-- Print idêntico re-enviado é barrado ANTES de chamar a IA — protege o banco
-- de dupla contagem e economiza API. Registros somem sozinhos após 90 dias
-- (limpeza no próprio fluxo de calibração).
CREATE TABLE IF NOT EXISTS prints_processados (
  id        SERIAL PRIMARY KEY,
  user_id   INTEGER NOT NULL REFERENCES usuarios(id),
  hash      TEXT NOT NULL,
  contexto  TEXT NOT NULL DEFAULT 'calibracao',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, hash)
);
