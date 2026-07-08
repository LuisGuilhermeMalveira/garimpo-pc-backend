-- Povoa o catálogo com as peças mais comuns do mercado usado BR, pra Luís só
-- precisar CALIBRAR (sem cadastrar uma a uma). Sem preço: cada peça nasce sem
-- preco_base e aparece como "sem calibração" até receber um print.
--
-- Idempotente: ON CONFLICT (user_id, categoria, nome) DO NOTHING — não duplica
-- nem sobrescreve o que o Luís já calibrou.

-- ============ ARMAZENAMENTO (faixas) ============
INSERT INTO pecas (categoria, nome, tipo, capacidade, liquidez, dias_venda_estim) VALUES
  ('ssd','SSD 120GB',        'unitaria', 120,  'alta',  5),
  ('ssd','SSD 480/512GB',    'unitaria', 512,  'alta',  5),
  ('ssd','SSD 1TB',          'unitaria', 1024, 'alta',  7),
  ('ssd','SSD 2TB',          'unitaria', 2048, 'alta',  10),
  ('hd', 'HD 500GB',         'unitaria', 500,  'media', 14),
  ('hd', 'HD 2TB',           'unitaria', 2048, 'media', 18)
ON CONFLICT (user_id, categoria, nome) DO NOTHING;

-- ============ MEMÓRIA RAM (módulos DDR4 desktop) ============
INSERT INTO pecas (categoria, nome, tipo, capacidade, liquidez, dias_venda_estim) VALUES
  ('ram','módulo 4GB DDR4',  'unitaria', 4,  'alta', 10),
  ('ram','módulo 32GB DDR4', 'unitaria', 32, 'alta', 10)
ON CONFLICT (user_id, categoria, nome) DO NOTHING;

-- ============ PLACAS DE VÍDEO (GPU) ============
INSERT INTO pecas (categoria, nome, tipo, liquidez, dias_venda_estim) VALUES
  ('gpu','GT 1030 2GB','inteira','media',20),
  ('gpu','GTX 750 Ti 2GB','inteira','media',20),
  ('gpu','GTX 1050 2GB','inteira','media',15),
  ('gpu','GTX 1050 Ti 4GB','inteira','alta',12),
  ('gpu','GTX 1060 3GB','inteira','alta',12),
  ('gpu','GTX 1060 6GB','inteira','alta',12),
  ('gpu','GTX 1070 8GB','inteira','alta',12),
  ('gpu','GTX 1070 Ti 8GB','inteira','media',15),
  ('gpu','GTX 1080 8GB','inteira','media',15),
  ('gpu','GTX 1080 Ti 11GB','inteira','media',18),
  ('gpu','GTX 1650 4GB','inteira','alta',10),
  ('gpu','GTX 1650 Super 4GB','inteira','alta',10),
  ('gpu','GTX 1660 6GB','inteira','alta',10),
  ('gpu','GTX 1660 Super 6GB','inteira','alta',10),
  ('gpu','GTX 1660 Ti 6GB','inteira','alta',12),
  ('gpu','RTX 2060 6GB','inteira','alta',12),
  ('gpu','RTX 2060 Super 8GB','inteira','alta',12),
  ('gpu','RTX 2070 Super 8GB','inteira','media',15),
  ('gpu','RTX 2080 Super 8GB','inteira','media',18),
  ('gpu','RTX 3050 8GB','inteira','alta',10),
  ('gpu','RTX 3060 8GB','inteira','alta',10),
  ('gpu','RTX 3060 12GB','inteira','alta',10),
  ('gpu','RTX 3070 8GB','inteira','alta',12),
  ('gpu','RTX 3070 Ti 8GB','inteira','media',14),
  ('gpu','RTX 3080 10GB','inteira','media',16),
  ('gpu','RTX 4060 8GB','inteira','alta',10),
  ('gpu','RTX 4060 Ti 8GB','inteira','alta',12),
  ('gpu','RTX 4070 12GB','inteira','media',15),
  ('gpu','RTX 4070 Super 12GB','inteira','media',15),
  ('gpu','RTX 4070 Ti 12GB','inteira','media',18),
  ('gpu','RX 550 4GB','inteira','media',18),
  ('gpu','RX 560 4GB','inteira','media',16),
  ('gpu','RX 570 4GB','inteira','alta',12),
  ('gpu','RX 570 8GB','inteira','alta',12),
  ('gpu','RX 580 4GB','inteira','alta',12),
  ('gpu','RX 580 8GB','inteira','alta',12),
  ('gpu','RX 590 8GB','inteira','media',15),
  ('gpu','RX 5500 XT 8GB','inteira','media',14),
  ('gpu','RX 5600 XT 6GB','inteira','media',14),
  ('gpu','RX 5700 8GB','inteira','media',14),
  ('gpu','RX 5700 XT 8GB','inteira','media',14),
  ('gpu','RX 6600 8GB','inteira','alta',12),
  ('gpu','RX 6600 XT 8GB','inteira','alta',12),
  ('gpu','RX 6650 XT 8GB','inteira','alta',12),
  ('gpu','RX 6700 XT 12GB','inteira','media',15),
  ('gpu','RX 6750 XT 12GB','inteira','media',16),
  ('gpu','RX 7600 8GB','inteira','alta',12),
  ('gpu','RX 7700 XT 12GB','inteira','media',16),
  ('gpu','RX 7800 XT 16GB','inteira','media',18)
ON CONFLICT (user_id, categoria, nome) DO NOTHING;

-- ============ PROCESSADORES (CPU) ============
INSERT INTO pecas (categoria, nome, tipo, liquidez, dias_venda_estim) VALUES
  ('cpu','Pentium G4560','inteira','media',18),
  ('cpu','Celeron G5905','inteira','media',20),
  ('cpu','Core i3-9100F','inteira','alta',12),
  ('cpu','Core i3-10100F','inteira','alta',12),
  ('cpu','Core i3-12100F','inteira','alta',10),
  ('cpu','Core i5-2400','inteira','media',18),
  ('cpu','Core i5-3470','inteira','media',16),
  ('cpu','Core i5-4460','inteira','media',16),
  ('cpu','Core i5-4570','inteira','media',16),
  ('cpu','Core i5-6400','inteira','media',15),
  ('cpu','Core i5-7400','inteira','media',15),
  ('cpu','Core i5-8400','inteira','alta',12),
  ('cpu','Core i5-9400F','inteira','alta',12),
  ('cpu','Core i5-10400F','inteira','alta',10),
  ('cpu','Core i5-11400F','inteira','alta',10),
  ('cpu','Core i5-12400F','inteira','alta',10),
  ('cpu','Core i7-2600','inteira','media',16),
  ('cpu','Core i7-3770','inteira','media',16),
  ('cpu','Core i7-4790','inteira','media',15),
  ('cpu','Core i7-7700','inteira','media',14),
  ('cpu','Core i7-8700','inteira','alta',12),
  ('cpu','Core i7-9700F','inteira','alta',12),
  ('cpu','Core i7-10700F','inteira','alta',12),
  ('cpu','Core i7-12700F','inteira','media',14),
  ('cpu','Athlon 3000G','inteira','media',16),
  ('cpu','Ryzen 3 1200','inteira','media',16),
  ('cpu','Ryzen 3 2200G','inteira','media',14),
  ('cpu','Ryzen 3 3200G','inteira','alta',12),
  ('cpu','Ryzen 5 1600','inteira','media',14),
  ('cpu','Ryzen 5 2600','inteira','alta',12),
  ('cpu','Ryzen 5 3500','inteira','alta',12),
  ('cpu','Ryzen 5 3600','inteira','alta',10),
  ('cpu','Ryzen 5 4500','inteira','alta',10),
  ('cpu','Ryzen 5 5500','inteira','alta',10),
  ('cpu','Ryzen 5 5600','inteira','alta',10),
  ('cpu','Ryzen 5 5600G','inteira','alta',10),
  ('cpu','Ryzen 5 5600X','inteira','alta',10),
  ('cpu','Ryzen 7 2700','inteira','media',14),
  ('cpu','Ryzen 7 3700X','inteira','alta',12),
  ('cpu','Ryzen 7 5700X','inteira','alta',12),
  ('cpu','Ryzen 7 5800X','inteira','media',14)
ON CONFLICT (user_id, categoria, nome) DO NOTHING;

-- ============ PLACAS-MÃE (por chipset) ============
INSERT INTO pecas (categoria, nome, tipo, liquidez, dias_venda_estim) VALUES
  ('mobo','H61','inteira','media',22),
  ('mobo','H81','inteira','media',22),
  ('mobo','B75','inteira','media',22),
  ('mobo','B85','inteira','media',20),
  ('mobo','H110','inteira','media',20),
  ('mobo','H310','inteira','media',18),
  ('mobo','B250','inteira','media',18),
  ('mobo','B360','inteira','media',18),
  ('mobo','B365','inteira','media',18),
  ('mobo','H410','inteira','media',18),
  ('mobo','B460','inteira','media',16),
  ('mobo','H510','inteira','media',16),
  ('mobo','B560','inteira','media',16),
  ('mobo','H610','inteira','media',16),
  ('mobo','B660','inteira','media',16),
  ('mobo','B760','inteira','media',16),
  ('mobo','A320','inteira','media',20),
  ('mobo','B350','inteira','media',18),
  ('mobo','B450','inteira','alta',14),
  ('mobo','X470','inteira','media',16),
  ('mobo','A520','inteira','media',16),
  ('mobo','B550','inteira','alta',14),
  ('mobo','X570','inteira','media',16),
  ('mobo','B650','inteira','media',16)
ON CONFLICT (user_id, categoria, nome) DO NOTHING;

-- ============ FONTES (por potência/selo) ============
INSERT INTO pecas (categoria, nome, tipo, liquidez, dias_venda_estim) VALUES
  ('fonte','Fonte 400W','inteira','media',16),
  ('fonte','Fonte 500W','inteira','media',16),
  ('fonte','Fonte 500W 80 Plus','inteira','media',14),
  ('fonte','Fonte 550W 80 Plus','inteira','media',14),
  ('fonte','Fonte 600W','inteira','media',14),
  ('fonte','Fonte 650W 80 Plus Bronze','inteira','alta',12),
  ('fonte','Fonte 750W 80 Plus Bronze','inteira','alta',12),
  ('fonte','Fonte 850W 80 Plus','inteira','media',14)
ON CONFLICT (user_id, categoria, nome) DO NOTHING;
