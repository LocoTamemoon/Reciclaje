ALTER TABLE recolectores ALTER COLUMN dni TYPE VARCHAR(7);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name='recolectores' AND constraint_name='recolectores_dni_digits_check'
  ) THEN
    ALTER TABLE recolectores ADD CONSTRAINT recolectores_dni_digits_check CHECK (dni ~ '^[0-9]{1,7}$');
  END IF;
END $$;
