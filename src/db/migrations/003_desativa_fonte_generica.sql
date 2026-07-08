-- "Fonte genérica −10%" saía do valor do PC INTEIRO ao mesmo tempo em que a
-- fonte genérica já era contada barata (piso) — dupla penalização, sem lógica.
-- Com o PISO por categoria, a fonte genérica entra com valor de chão e NÃO se
-- desconta % por cima. Então desativamos esse modificador.
-- (Continua editável: dá pra religar na tela de Modificadores ou no banco.)

UPDATE modificadores SET ativo = false WHERE nome = 'Fonte genérica';
