CREATE TABLE IF NOT EXISTS recolectores (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  lat NUMERIC(9,6),
  lon NUMERIC(9,6),
  reputacion_promedio NUMERIC(4,2) NOT NULL DEFAULT 3.00,
  trabajos_completados INTEGER NOT NULL DEFAULT 0,
  creado_en TIMESTAMP NOT NULL DEFAULT NOW()
);