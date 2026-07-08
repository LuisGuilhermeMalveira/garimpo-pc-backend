-- Preço EFETIVO por peça: média ponderada de TODAS as calibrações, com peso que
-- decai no tempo (meia-vida de 30 dias). Ideia do Luís:
--   hoje = 100% · 1 mês = 50% · 2 meses = 25% · 3 meses = 12,5% ... (nunca zera)
-- O preço novo manda; o antigo vira "sombra" mas ainda conta um tiquinho.
-- peso = 0.5 ^ (idade_em_dias / 30)
--
-- Substitui o "usa só a última calibração" por essa média com memória.
-- min/max seguem o mesmo peso (faixa de mercado suavizada). data_calibracao =
-- a MAIS recente (é o que dá o frescor 🟢🟡🟠🔴). amostras = total acumulado.
CREATE OR REPLACE VIEW precos_efetivos AS
SELECT
  pb.peca_id,
  round(SUM(pb.preco_mediana * w.peso) / NULLIF(SUM(w.peso), 0), 2) AS preco_mediana,
  round(SUM(pb.preco_min     * w.peso) / NULLIF(SUM(w.peso), 0), 2) AS preco_min,
  round(SUM(pb.preco_max     * w.peso) / NULLIF(SUM(w.peso), 0), 2) AS preco_max,
  SUM(pb.amostras)        AS amostras,
  MAX(pb.data_calibracao) AS data_calibracao,
  COUNT(*)                AS total_calibracoes
FROM precos_base pb
CROSS JOIN LATERAL (
  SELECT power(0.5, EXTRACT(EPOCH FROM (now() - pb.data_calibracao)) / (30.0 * 86400)) AS peso
) w
GROUP BY pb.peca_id;
