-- Insertar tipos faltantes basados en vehiculos.tipo
INSERT INTO vehiculo_tipos(nombre, activo)
SELECT DISTINCT LOWER(v.tipo) AS nombre, true AS activo
FROM vehiculos v
LEFT JOIN vehiculo_tipos t ON LOWER(t.nombre) = LOWER(v.tipo)
WHERE t.id IS NULL AND v.tipo IS NOT NULL AND v.tipo <> ''
ON CONFLICT (nombre) DO NOTHING;

-- Backfill: asignar tipo_id en vehiculos según coincidencia por nombre (case-insensitive)
UPDATE vehiculos v
SET tipo_id = t.id, tipo = t.nombre
FROM vehiculo_tipos t
WHERE v.tipo_id IS NULL AND LOWER(t.nombre) = LOWER(v.tipo);

-- Reforzar relación: exigir tipo_id NOT NULL
ALTER TABLE vehiculos ALTER COLUMN tipo_id SET NOT NULL;

