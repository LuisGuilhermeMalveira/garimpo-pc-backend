-- Renomeia os módulos de RAM de "módulo XGB DDR4" para "Memória XGB DDR4".
-- Mantém o mesmo id (preço-base calibrado fica preservado).
UPDATE pecas
   SET nome = regexp_replace(nome, '^módulo ', 'Memória ')
 WHERE categoria = 'ram'
   AND nome LIKE 'módulo %';
