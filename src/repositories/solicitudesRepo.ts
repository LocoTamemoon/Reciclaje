import { pool } from "../db/pool";

export async function crearSolicitud(usuarioId: number, empresaId: number) {
  const res = await pool.query(
    "INSERT INTO solicitudes(usuario_id, empresa_id, estado) VALUES($1, $2, 'pendiente_empresa') RETURNING *",
    [usuarioId, empresaId]
  );
  return res.rows[0];
}

export async function obtenerSolicitud(id: number) {
  const res = await pool.query("SELECT * FROM solicitudes WHERE id=$1", [id]);
  return res.rows[0] || null;
}

export async function solicitudesPendientesEmpresa(empresaId: number) {
  const res = await pool.query(
    "SELECT * FROM solicitudes WHERE empresa_id=$1 AND estado='pendiente_empresa' ORDER BY creado_en DESC",
    [empresaId]
  );
  return res.rows;
}

export async function actualizarEstadoSolicitud(id: number, estado: string) {
  const res = await pool.query(
    "UPDATE solicitudes SET estado=$2 WHERE id=$1 RETURNING *",
    [id, estado]
  );
  return res.rows[0];
}

export async function guardarItemsSolicitudJSON(id: number, items: { material_id: number; kg: number }[]) {
  await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS items_json jsonb");
  const res = await pool.query(
    "UPDATE solicitudes SET items_json=$2 WHERE id=$1 RETURNING *",
    [id, JSON.stringify(items)]
  );
  return res.rows[0];
}