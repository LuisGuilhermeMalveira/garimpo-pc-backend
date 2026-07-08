-- Water cooler +5% saía como bônus de valor mesmo quando o Luís já conta o
-- valor do water cooler como peça -> dupla contagem. Desativa o modificador.
-- (Continua editável: dá pra religar na tela de Modificadores ou no banco.)
UPDATE modificadores SET ativo = false WHERE nome = 'Water cooler';
