ALTER TABLE materiales ADD COLUMN IF NOT EXISTS precio_base_por_kg NUMERIC(10,2);

INSERT INTO materiales(nombre, precio_base_por_kg) VALUES
  ('Plástico PET', 1.20),
  ('Plástico HDPE', 1.00),
  ('Plástico PP', 0.90),
  ('Plástico PVC', 0.80),
  ('Plástico PS', 0.70),
  ('Cartón', 0.80),
  ('Papel', 0.50),
  ('Vidrio', 0.20),
  ('Aluminio', 2.50),
  ('Chatarra Ferrosa', 0.60),
  ('Cobre', 8.00),
  ('Latón', 6.50)
ON CONFLICT (nombre) DO UPDATE SET precio_base_por_kg=EXCLUDED.precio_base_por_kg;