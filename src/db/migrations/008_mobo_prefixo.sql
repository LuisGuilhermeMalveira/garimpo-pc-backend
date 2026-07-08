-- Prefixa as placas-mãe com "Placa-mãe " (o seed criou só o chipset: "B550").
-- Não duplica as que já têm o prefixo, e pula casos que gerariam nome repetido.
UPDATE pecas p
   SET nome = 'Placa-mãe ' || p.nome
 WHERE p.categoria = 'mobo'
   AND p.nome NOT LIKE 'Placa-mãe %'
   AND NOT EXISTS (
     SELECT 1 FROM pecas q
      WHERE q.user_id = p.user_id
        AND q.categoria = 'mobo'
        AND q.nome = 'Placa-mãe ' || p.nome
   );
