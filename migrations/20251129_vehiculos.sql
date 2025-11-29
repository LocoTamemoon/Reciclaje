CREATE TABLE IF NOT EXISTS vehiculos (
  id SERIAL PRIMARY KEY,
  recolector_id INTEGER NOT NULL REFERENCES recolectores(id) ON DELETE CASCADE,
  tipo VARCHAR(32) NOT NULL,
  placa VARCHAR(32) UNIQUE NOT NULL,
  capacidad_kg NUMERIC(10,2) NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS vehiculo_id INTEGER;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_solicitudes_vehiculo'
  ) THEN
    ALTER TABLE solicitudes ADD CONSTRAINT fk_solicitudes_vehiculo FOREIGN KEY (vehiculo_id) REFERENCES vehiculos(id);
  END IF;
END $$;

