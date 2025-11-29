CREATE TABLE IF NOT EXISTS vehiculo_tipos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(32) UNIQUE NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO vehiculo_tipos(nombre, activo)
  VALUES ('moto', true), ('auto', true), ('camioneta', true), ('camion', true)
ON CONFLICT (nombre) DO NOTHING;

ALTER TABLE vehiculos ADD COLUMN IF NOT EXISTS tipo_id INTEGER;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_vehiculos_tipo'
  ) THEN
    ALTER TABLE vehiculos ADD CONSTRAINT fk_vehiculos_tipo FOREIGN KEY (tipo_id) REFERENCES vehiculo_tipos(id);
  END IF;
END $$;

