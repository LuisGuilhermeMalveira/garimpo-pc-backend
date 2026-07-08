-- Novo status: "negociando" — PC que o Luís está em conversa com o vendedor,
-- entre "em aberto" e "comprei/passei". (ALTER TYPE ... ADD VALUE é idempotente
-- com IF NOT EXISTS.)
ALTER TYPE status_prospeccao ADD VALUE IF NOT EXISTS 'negociando';
