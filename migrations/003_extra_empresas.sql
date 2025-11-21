INSERT INTO empresas (ruc, nombre, logo, lat, lon) VALUES
  ('20555555111', 'Recicla Perú SRL', NULL, -12.0600, -77.0300),
  ('20666666222', 'EcoCentro Lima', NULL, -12.0550, -77.0350)
ON CONFLICT DO NOTHING;