-- Pisos por categoria viram CONFIG do usuário (editáveis na tela), em vez de
-- constante no código. JSONB com os mesmos defaults de config/constantes.js.
-- gpu = null de propósito (sem piso: exige modelo/estimativa).

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS pisos JSONB NOT NULL DEFAULT
  '{"cpu":150,"gpu":null,"mobo":120,"ram":50,"fonte":150,"ssd":90,"hd":70,"cooler":25,"gabinete":70,"monitor":200,"periferico":30,"outro":0}'::jsonb;
