INSERT INTO materiales (nombre) VALUES
  ('Plástico PET'),
  ('Vidrio'),
  ('Papel'),
  ('Aluminio'),
  ('Cartón')
ON CONFLICT DO NOTHING;

INSERT INTO empresas (ruc, nombre, logo, lat, lon) VALUES
  ('20123456789', 'EcoRecicla S.A.', NULL, -12.0464, -77.0428),
  ('20987654321', 'GreenLoop SAC', NULL, -12.0500, -77.0300)
ON CONFLICT DO NOTHING;

INSERT INTO usuarios (lat, lon) VALUES (-12.0450, -77.0300);

INSERT INTO empresa_materiales_precio (empresa_id, material_id, precio_por_kg, condiciones)
SELECT e.id, m.id, p.precio, p.cond
FROM (
  VALUES
    ('20123456789','Plástico PET', 1.20, 'Limpio y sin etiqueta'),
    ('20123456789','Vidrio', 0.80, 'Sin restos de líquido'),
    ('20123456789','Papel', 0.50, 'Seco y limpio'),
    ('20123456789','Aluminio', 2.50, 'Latas compactadas'),
    ('20987654321','Plástico PET', 1.10, 'Acepta mixto'),
    ('20987654321','Cartón', 0.60, 'Atado en fardos'),
    ('20987654321','Aluminio', 2.40, 'Sin residuos')
) AS p(ruc, material, precio, cond)
JOIN empresas e ON e.ruc = p.ruc
JOIN materiales m ON m.nombre = p.material
ON CONFLICT DO NOTHING;