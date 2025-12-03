ALTER TABLE recolectores ADD COLUMN IF NOT EXISTS estado BOOLEAN NOT NULL DEFAULT false;

UPDATE recolectores SET estado=true WHERE email='reco.demo@vidaverde.com';
UPDATE recolectores SET estado=true WHERE email='reco2@example.com';
