ALTER TABLE recolectores ADD COLUMN IF NOT EXISTS resenas_recibidas_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS pickup_recolector_id INTEGER;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name='solicitudes' AND constraint_name='solicitudes_pickup_recolector_id_fkey'
  ) THEN
    ALTER TABLE solicitudes ADD CONSTRAINT solicitudes_pickup_recolector_id_fkey FOREIGN KEY (pickup_recolector_id) REFERENCES recolectores(id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS resenas_recolectores (
  id SERIAL PRIMARY KEY,
  recolector_id INTEGER NOT NULL REFERENCES recolectores(id) ON DELETE CASCADE,
  evaluador_rol VARCHAR(32) NOT NULL CHECK (evaluador_rol IN ('usuario','empresa')),
  evaluador_id INTEGER NOT NULL,
  transaccion_id INTEGER NOT NULL REFERENCES transacciones(id) ON DELETE CASCADE,
  solicitud_id INTEGER NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  puntaje INTEGER NOT NULL CHECK (puntaje >= 1 AND puntaje <= 5),
  mensaje TEXT,
  creado_en TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (recolector_id, evaluador_rol, evaluador_id, transaccion_id)
);

CREATE TABLE IF NOT EXISTS resenas_empresas_por_recolector (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  recolector_id INTEGER NOT NULL REFERENCES recolectores(id) ON DELETE CASCADE,
  transaccion_id INTEGER NOT NULL REFERENCES transacciones(id) ON DELETE CASCADE,
  puntaje INTEGER NOT NULL CHECK (puntaje >= 1 AND puntaje <= 5),
  mensaje TEXT,
  creado_en TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, recolector_id, transaccion_id)
);

CREATE TABLE IF NOT EXISTS resenas_usuarios_por_recolector (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  recolector_id INTEGER NOT NULL REFERENCES recolectores(id) ON DELETE CASCADE,
  transaccion_id INTEGER NOT NULL REFERENCES transacciones(id) ON DELETE CASCADE,
  puntaje INTEGER NOT NULL CHECK (puntaje >= 1 AND puntaje <= 5),
  mensaje TEXT,
  creado_en TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (usuario_id, recolector_id, transaccion_id)
);
