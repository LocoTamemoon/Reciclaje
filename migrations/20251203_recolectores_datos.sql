ALTER TABLE recolectores ADD COLUMN IF NOT EXISTS nombre TEXT;
ALTER TABLE recolectores ADD COLUMN IF NOT EXISTS apellidos TEXT;
ALTER TABLE recolectores ADD COLUMN IF NOT EXISTS dni VARCHAR(16);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name='recolectores' AND constraint_name='recolectores_dni_unique'
  ) THEN
    ALTER TABLE recolectores ADD CONSTRAINT recolectores_dni_unique UNIQUE (dni);
  END IF;
END $$;
