CREATE TABLE IF NOT EXISTS notificaciones (
  id SERIAL PRIMARY KEY,
  solicitud_id INTEGER,
  actor_destino VARCHAR(16) NOT NULL,
  destino_id INTEGER NOT NULL,
  tipo VARCHAR(32) NOT NULL,
  mensaje TEXT NOT NULL,
  leido BOOLEAN NOT NULL DEFAULT false,
  creado_en TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY (solicitud_id) REFERENCES solicitudes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifs_destino ON notificaciones(actor_destino, destino_id, leido, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_notifs_solicitud ON notificaciones(solicitud_id, creado_en DESC);

