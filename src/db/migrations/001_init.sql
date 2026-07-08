-- ============ USUÁRIOS ============
CREATE TABLE usuarios (
  id          SERIAL PRIMARY KEY,
  nome        TEXT NOT NULL,
  email       TEXT UNIQUE,
  -- config global de negócio (editável)
  fator_realizacao   NUMERIC(4,3) NOT NULL DEFAULT 0.90,  -- vende a ~90% do pedido
  piso_lucro         NUMERIC(8,2) NOT NULL DEFAULT 250,   -- mínimo p/ "compensa"
  margem_risco_pct   NUMERIC(4,3) NOT NULL DEFAULT 0.05,  -- 5% sobre preço pedido
  custo_km           NUMERIC(6,3) NOT NULL DEFAULT 0.42,  -- R$/km no etanol
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO usuarios (nome, email) VALUES ('Luís', 'luis@garimpo.local');

-- ============ CIDADES ============
CREATE TABLE cidades (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES usuarios(id) DEFAULT 1,
  nome            TEXT NOT NULL,
  km_ida_volta    NUMERIC(6,1) NOT NULL,
  custo_aquisicao NUMERIC(8,2) NOT NULL,     -- R$ combustível ida+volta
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO cidades (nome, km_ida_volta, custo_aquisicao) VALUES
  ('Montes Claros', 0,   0),
  ('Bocaiúva',      100, 45),
  ('Francisco Sá',  120, 55),
  ('Coração de Jesus', 130, 60),
  ('Januária',      270, 120),
  ('Janaúba',       280, 125),
  ('Pirapora',      320, 140);

-- ============ PEÇAS ============
CREATE TYPE categoria_peca AS ENUM
  ('gpu','cpu','mobo','ram','fonte','ssd','hd','cooler','gabinete');
CREATE TYPE nivel_liquidez AS ENUM ('alta','media','baixa');
CREATE TYPE tipo_peca AS ENUM ('inteira','unitaria');

CREATE TABLE pecas (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES usuarios(id) DEFAULT 1,
  categoria   categoria_peca NOT NULL,
  nome        TEXT NOT NULL,            -- "RTX 4060 8GB", "Ryzen 5 5600", "B450", "módulo 16GB DDR4"
  tipo        tipo_peca NOT NULL DEFAULT 'inteira',
  capacidade  INTEGER,                  -- só unitaria: GB do módulo (16) ou faixa SSD (512)
  liquidez    nivel_liquidez NOT NULL DEFAULT 'media',
  dias_venda_estim INTEGER,             -- estimativa de dias até vender essa peça em MOC
  observacao  TEXT,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, categoria, nome)
);
-- seeds de peças unitárias
INSERT INTO pecas (categoria, nome, tipo, capacidade, liquidez, dias_venda_estim) VALUES
  ('ram','módulo 8GB DDR4',  'unitaria', 8,    'alta',  7),
  ('ram','módulo 16GB DDR4', 'unitaria', 16,   'alta',  7),
  ('ssd','SSD 240GB',        'unitaria', 240,  'alta',  5),
  ('ssd','SSD 480/512GB',    'unitaria', 512,  'alta',  5),
  ('ssd','SSD 1TB',          'unitaria', 1024, 'alta',  7),
  ('hd', 'HD 1TB',           'unitaria', 1024, 'media', 14);

-- ============ PREÇOS-BASE (histórico = tendência) ============
CREATE TABLE precos_base (
  id              SERIAL PRIMARY KEY,
  peca_id         INTEGER NOT NULL REFERENCES pecas(id) ON DELETE CASCADE,
  preco_min       NUMERIC(8,2) NOT NULL,
  preco_mediana   NUMERIC(8,2) NOT NULL,
  preco_max       NUMERIC(8,2) NOT NULL,
  amostras        INTEGER NOT NULL DEFAULT 1,
  fonte           TEXT,                  -- "print busca OLX", "print Facebook", "manual"
  data_calibracao TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_precos_base_peca_data ON precos_base (peca_id, data_calibracao DESC);

-- ============ MODIFICADORES (ajustes % por gatilho) ============
CREATE TYPE sentido_mod AS ENUM ('sobe','desce');
CREATE TABLE modificadores (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES usuarios(id) DEFAULT 1,
  nome        TEXT NOT NULL,             -- "fonte genérica", "garantia/NF"
  gatilho     TEXT NOT NULL,             -- palavra/condição que ativa (lido pela IA)
  sentido     sentido_mod NOT NULL,
  percentual  NUMERIC(4,3) NOT NULL,     -- 0.10 = 10%
  argumento   TEXT,                      -- frase de barganha gerada quando ativa
  ativo       BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO modificadores (nome, gatilho, sentido, percentual, argumento) VALUES
  ('Fonte genérica',      'fonte sem marca / Kratos / Mancer / Husky', 'desce', 0.10, 'Fonte genérica, vou ter que trocar por uma de marca.'),
  ('Sinais de mineração', 'GPU popular de mineração + build antigo',   'desce', 0.20, 'Placa com cara de mineração, alto risco de degradação.'),
  ('Plataforma morta',    'DDR3 / AM4 1ª geração / chipset A320-H410',  'desce', 0.10, 'Plataforma sem upgrade, não dá pra evoluir.'),
  ('Sem foto rodando',    'ausência de foto/vídeo funcionando',        'desce', 0.05, 'Sem prova de funcionamento, comprando no escuro.'),
  ('Gabinete velho/feio', 'gabinete amarelado / antigo / sem vidro',   'desce', 0.07, 'Gabinete datado, menos atrativo pra revenda.'),
  ('Slots RAM cheios',    '16GB em 2x8 (sem espaço p/ upgrade)',        'desce', 0.03, 'RAM já ocupa os slots, upgrade exige trocar.'),
  ('Garantia / NF',       'na garantia / nota fiscal',                 'sobe',  0.12, NULL),
  ('Gabinete branco/vidro','gabinete branco / vidro / bonito',         'sobe',  0.08, NULL),
  ('Water cooler',        'water cooler / refrigeração líquida',       'sobe',  0.05, NULL),
  ('Upgrade path (B550)', 'mobo B450/B550 (aceita upgrade)',           'sobe',  0.05, NULL),
  ('Fonte com folga',     'fonte 650W+ de marca',                      'sobe',  0.04, NULL);

-- ============ PROSPECÇÕES ============
CREATE TYPE veredito_tipo AS ENUM ('compensa','marginal','nao_compensa','incompleto');
CREATE TYPE status_prospeccao AS ENUM ('analisado','comprei','passei');
CREATE TYPE origem_anuncio AS ENUM ('olx','facebook','outro');

CREATE TABLE prospeccoes (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES usuarios(id) DEFAULT 1,
  titulo            TEXT,
  origem            origem_anuncio NOT NULL DEFAULT 'olx',
  cidade_id         INTEGER REFERENCES cidades(id),
  preco_pedido      NUMERIC(8,2),
  preco_pix         NUMERIC(8,2),
  tem_entrega       BOOLEAN NOT NULL DEFAULT false,
  valor_entrega     NUMERIC(8,2),
  -- cálculo
  valor_bruto_pecas NUMERIC(8,2),
  valor_modificado  NUMERIC(8,2),        -- após Σ modificadores
  valor_revenda     NUMERIC(8,2),        -- após fator de realização
  custo_aquisicao   NUMERIC(8,2),
  custo_recuperacao NUMERIC(8,2) DEFAULT 0,
  margem_risco      NUMERIC(8,2),
  lucro_liquido     NUMERIC(8,2),
  dias_ate_vender   INTEGER,
  lucro_por_mes     NUMERIC(8,2),
  -- canibalização
  valor_canibalizado NUMERIC(8,2),       -- soma vendendo peça a peça
  -- 3 preços de negociação
  preco_teto        NUMERIC(8,2),        -- máx que mantém piso de lucro
  preco_oferta      NUMERIC(8,2),        -- onde abrir a negociação
  -- confiança
  score_confianca   INTEGER,             -- 0-100 (omissões derrubam)
  possivel_garimpo  BOOLEAN NOT NULL DEFAULT false, -- ❓ promete mas falta confirmar
  motivo_garimpo    TEXT,                -- por que é ❓ (modelo oculto, preço 🔴, etc.)
  fingerprint       TEXT,                -- hash p/ dedup (título+preço+cidade+specs)
  -- meta
  veredito          veredito_tipo NOT NULL DEFAULT 'incompleto',
  imagem_url        TEXT,                -- print no Cloudinary
  link_origem       TEXT,
  raw_extracao      JSONB,
  argumentos        JSONB,               -- lista de frases de barganha geradas
  status            status_prospeccao NOT NULL DEFAULT 'analisado',
  preco_venda_real  NUMERIC(8,2),        -- futuro: medir acerto
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ ITENS DA PROSPECÇÃO ============
CREATE TYPE origem_preco AS ENUM ('real','estimado');
CREATE TABLE prospeccao_itens (
  id              SERIAL PRIMARY KEY,
  prospeccao_id   INTEGER NOT NULL REFERENCES prospeccoes(id) ON DELETE CASCADE,
  categoria       categoria_peca NOT NULL,
  modelo_extraido TEXT NOT NULL,
  modelo_incerto  BOOLEAN NOT NULL DEFAULT false,
  peca_id         INTEGER REFERENCES pecas(id),     -- NULL se faltante
  quantidade      INTEGER NOT NULL DEFAULT 1,       -- decomposição: 48GB = 3 módulos
  preco_unitario  NUMERIC(8,2),
  preco_aplicado  NUMERIC(8,2),                     -- quantidade × unitário (ou mediana)
  origem          origem_preco NOT NULL DEFAULT 'real',
  peca_referencia_id INTEGER REFERENCES pecas(id),  -- peça-parente da estimativa
  removivel       BOOLEAN NOT NULL DEFAULT false,   -- monitor/periférico que dá p/ tirar da oferta
  frescor_dias    INTEGER,
  faltante        BOOLEAN NOT NULL DEFAULT false
);

-- ============ MODIFICADORES APLICADOS (por prospecção) ============
CREATE TABLE prospeccao_modificadores (
  id              SERIAL PRIMARY KEY,
  prospeccao_id   INTEGER NOT NULL REFERENCES prospeccoes(id) ON DELETE CASCADE,
  modificador_id  INTEGER REFERENCES modificadores(id),
  nome            TEXT NOT NULL,         -- snapshot (caso o modificador mude depois)
  sentido         sentido_mod NOT NULL,
  percentual      NUMERIC(4,3) NOT NULL,
  argumento       TEXT
);

-- ============ CANDIDATOS DE LOTE (a peneira) ============
CREATE TYPE veredito_rapido AS ENUM ('compensa','possivel_garimpo','nao_compensa');
CREATE TYPE status_candidato AS ENUM ('novo','visto','aprofundado','descartado');

CREATE TABLE candidatos_lote (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES usuarios(id) DEFAULT 1,
  -- identificação / dedup
  fingerprint     TEXT NOT NULL,          -- hash título+preço+cidade+specs
  link_origem     TEXT,                   -- se houver, dedup por link é prioritário
  origem          origem_anuncio NOT NULL DEFAULT 'olx',
  -- dados leves lidos do print de busca
  titulo          TEXT,
  cidade_id       INTEGER REFERENCES cidades(id),
  cidade_texto    TEXT,                   -- cidade crua lida (caso não case com cadastro)
  preco_pedido    NUMERIC(8,2),
  peca_principal  TEXT,                   -- GPU/peça que define o valor
  tem_entrega     BOOLEAN DEFAULT false,
  -- veredito rápido (peneira)
  lucro_estimado  NUMERIC(8,2),
  lucro_por_mes   NUMERIC(8,2),
  veredito        veredito_rapido,
  motivo_garimpo  TEXT,                   -- se ❓, por quê
  -- ciclo de vida
  status          status_candidato NOT NULL DEFAULT 'novo',
  prospeccao_id   INTEGER REFERENCES prospeccoes(id), -- quando aprofundado vira lupa
  visto_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, fingerprint)           -- dedup forte: mesma fingerprint não duplica
);
CREATE INDEX idx_candidatos_status ON candidatos_lote (user_id, status, lucro_por_mes DESC);
