-- Amplia as categorias de peça pra cobrir o que vem junto no PC mas não é
-- componente "interno": monitor, periféricos (teclado/mouse/headset) e um
-- coringa "outro". Usados sobretudo como itens REMOVÍVEIS na triagem
-- ("compro sem o monitor por R$X").
--
-- ADD VALUE IF NOT EXISTS é idempotente (PG 12+). Não usamos o valor novo
-- na mesma migration, então o COMMIT libera o uso normalmente.

ALTER TYPE categoria_peca ADD VALUE IF NOT EXISTS 'monitor';
ALTER TYPE categoria_peca ADD VALUE IF NOT EXISTS 'periferico';
ALTER TYPE categoria_peca ADD VALUE IF NOT EXISTS 'outro';
