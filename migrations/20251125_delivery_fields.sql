ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS tipo_entrega VARCHAR(16);
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS delivery_consent BOOLEAN DEFAULT false;
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS delivery_terms_version VARCHAR(32);
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS estado_publicacion VARCHAR(32);
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS estado_operativo VARCHAR(32);
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS clasificacion_distancia VARCHAR(16);
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS recolector_id INTEGER;
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(12,2);
