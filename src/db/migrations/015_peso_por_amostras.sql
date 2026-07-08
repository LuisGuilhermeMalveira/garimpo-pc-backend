-- Peso da média ponderada agora = decaimento_por_data × nº de AMOSTRAS.
-- Sem isso, uma calibração de 1 anúncio de hoje empataria com uma de 7 de
-- ontem — 1 anúncio maluco dominaria o preço. Com amostras no peso, entrada
-- pequena tem influência proporcional (e aceitar calibração de 1 amostra
-- fica seguro: ela soma, não domina).
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
  SELECT power(0.5, EXTRACT(EPOCH FROM (now() - pb.data_calibracao)) / (30.0 * 86400))
         * GREATEST(pb.amostras, 1) AS peso
) w
GROUP BY pb.peca_id;
