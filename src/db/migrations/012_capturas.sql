-- Capturas da extensão: print + contexto ficam "pendurados" até o Luís mandar
-- ler na Triagem (fluxo escolhido: extensão só carrega; a análise é manual).
-- Efêmeras: limpas ao criar novas (mais de 2 dias) — não é acervo, é fila.
CREATE TABLE IF NOT EXISTS capturas (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES usuarios(id),
  imagem_b64 TEXT NOT NULL,             -- jpeg base64 (print da página inteira)
  mimetype   TEXT NOT NULL DEFAULT 'image/jpeg',
  texto      TEXT,                      -- texto visível da página (ajuda o parser)
  link       TEXT,
  origem     origem_anuncio NOT NULL DEFAULT 'olx',
  titulo     TEXT,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
