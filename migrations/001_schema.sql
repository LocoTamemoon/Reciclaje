CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  solicitudes_count INTEGER NOT NULL DEFAULT 0,
  puntos_acumulados INTEGER NOT NULL DEFAULT 0,
  kg_totales NUMERIC(12,2) NOT NULL DEFAULT 0,
  reputacion_promedio NUMERIC(4,2) NOT NULL DEFAULT 3.00,
  resenas_recibidas_count INTEGER NOT NULL DEFAULT 0,
  lat NUMERIC(9,6),
  lon NUMERIC(9,6),
  creado_en TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS empresas (
  id SERIAL PRIMARY KEY,
  ruc VARCHAR(50) NOT NULL UNIQUE,
  nombre VARCHAR(255) NOT NULL,
  logo VARCHAR(1024),
  lat NUMERIC(9,6),
  lon NUMERIC(9,6),
  reputacion_promedio NUMERIC(4,2) NOT NULL DEFAULT 3.00,
  resenas_recibidas_count INTEGER NOT NULL DEFAULT 0,
  creado_en TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS materiales (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS empresa_materiales_precio (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  material_id INTEGER NOT NULL REFERENCES materiales(id) ON DELETE CASCADE,
  precio_por_kg NUMERIC(12,2) NOT NULL,
  condiciones TEXT,
  UNIQUE (empresa_id, material_id)
);

CREATE TABLE IF NOT EXISTS solicitudes (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  estado VARCHAR(32) NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transacciones (
  id SERIAL PRIMARY KEY,
  solicitud_id INTEGER NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  monto_pagado NUMERIC(14,2) NOT NULL,
  metodo_pago VARCHAR(32) NOT NULL,
  fecha TIMESTAMP NOT NULL DEFAULT NOW(),
  lat NUMERIC(9,6),
  lon NUMERIC(9,6),
  estado VARCHAR(32) NOT NULL DEFAULT 'completada',
  puntos_obtenidos INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pesajes (
  id SERIAL PRIMARY KEY,
  transaccion_id INTEGER NOT NULL REFERENCES transacciones(id) ON DELETE CASCADE,
  material_id INTEGER NOT NULL REFERENCES materiales(id) ON DELETE CASCADE,
  kg_finales NUMERIC(12,3) NOT NULL,
  UNIQUE (transaccion_id, material_id)
);

CREATE TABLE IF NOT EXISTS usuario_materiales_totales (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  material_id INTEGER NOT NULL REFERENCES materiales(id) ON DELETE CASCADE,
  kg_totales NUMERIC(12,3) NOT NULL DEFAULT 0,
  UNIQUE (usuario_id, material_id)
);

CREATE TABLE IF NOT EXISTS resenas_empresas (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  transaccion_id INTEGER NOT NULL REFERENCES transacciones(id) ON DELETE CASCADE,
  puntaje INTEGER NOT NULL CHECK (puntaje >= 1 AND puntaje <= 5),
  mensaje TEXT,
  creado_en TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS resenas_usuarios (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  transaccion_id INTEGER NOT NULL REFERENCES transacciones(id) ON DELETE CASCADE,
  puntaje INTEGER NOT NULL CHECK (puntaje >= 1 AND puntaje <= 5),
  mensaje TEXT,
  creado_en TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_usuario ON solicitudes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_empresa ON solicitudes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_transacciones_usuario ON transacciones(usuario_id);
CREATE INDEX IF NOT EXISTS idx_transacciones_empresa ON transacciones(empresa_id);