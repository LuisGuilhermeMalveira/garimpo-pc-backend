-- Luís: tirar os modificadores % — o valor já vem da soma das peças.
-- Desativa todos (ficam editáveis; dá pra religar no banco ou na tela futura).
UPDATE modificadores SET ativo = false WHERE user_id = 1;
