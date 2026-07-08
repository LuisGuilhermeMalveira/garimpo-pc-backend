-- Telefone/WhatsApp do vendedor, pra virar botão de contato na fila de ação.
ALTER TABLE prospeccoes ADD COLUMN IF NOT EXISTS telefone TEXT;
