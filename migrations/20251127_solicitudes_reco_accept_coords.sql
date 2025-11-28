ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS recolector_accept_lat NUMERIC(9,6);
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS recolector_accept_lon NUMERIC(9,6);