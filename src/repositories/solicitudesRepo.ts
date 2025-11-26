import { pool } from "../db/pool";

export async function crearSolicitud(usuarioId: number, empresaId: number) {
  const res = await pool.query(
    "INSERT INTO solicitudes(usuario_id, empresa_id, estado) VALUES($1, $2, 'pendiente_empresa') RETURNING *",
    [usuarioId, empresaId]
  );
  return res.rows[0];
}

export async function crearSolicitudDelivery(
  usuarioId: number,
  empresaId: number,
  deliveryFee: number,
  clasificacion: string,
  consent: boolean,
  termsVersion: string | null
) {
  const res = await pool.query(
    "INSERT INTO solicitudes(usuario_id, empresa_id, estado, tipo_entrega, estado_publicacion, delivery_fee, clasificacion_distancia, delivery_consent, delivery_terms_version) VALUES($1,$2,'pendiente_empresa','delivery','publicada',$3,$4,$5,$6) RETURNING *",
    [usuarioId, empresaId, deliveryFee, clasificacion, consent, termsVersion]
  );
  return res.rows[0];
}

export async function obtenerSolicitud(id: number) {
  const res = await pool.query("SELECT * FROM solicitudes WHERE id=$1", [id]);
  return res.rows[0] || null;
}

export async function solicitudesPendientesEmpresa(empresaId: number) {
  const res = await pool.query(
    "SELECT * FROM solicitudes WHERE empresa_id=$1 AND estado='pendiente_empresa' AND (COALESCE(tipo_entrega,'') <> 'delivery' OR estado_publicacion='aceptada_recolector') ORDER BY creado_en DESC",
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

export async function aceptarPorRecolector(id: number, recolectorId: number) {
  const res = await pool.query(
    "UPDATE solicitudes SET estado_publicacion='aceptada_recolector', recolector_id=$2 WHERE id=$1 AND estado_publicacion='publicada' RETURNING *",
    [id, recolectorId]
  );
  return res.rows[0] || null;
}

export async function actualizarEstadoOperativo(id: number, estado: string) {
  const res = await pool.query(
    "UPDATE solicitudes SET estado_operativo=$2 WHERE id=$1 RETURNING *",
    [id, estado]
  );
  return res.rows[0];
}

export async function listarSolicitudesPublicadas() {
  const res = await pool.query(
    "SELECT * FROM solicitudes WHERE tipo_entrega='delivery' AND estado_publicacion='publicada' ORDER BY creado_en DESC"
  );
  return res.rows;
}

export async function guardarItemsSolicitudJSON(id: number, items: { material_id: number; kg: number }[]) {
  await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS items_json jsonb");
  const res = await pool.query(
    "UPDATE solicitudes SET items_json=$2 WHERE id=$1 RETURNING *",
    [id, JSON.stringify(items)]
  );
  return res.rows[0];
}

export async function historialRecolector(recolectorId: number) {
  const res = await pool.query(
    "SELECT s.id, s.usuario_id, u.email AS usuario_email, s.empresa_id, e.nombre AS empresa_nombre, s.delivery_fee, s.clasificacion_distancia, s.creado_en, s.estado FROM solicitudes s JOIN usuarios u ON u.id=s.usuario_id JOIN empresas e ON e.id=s.empresa_id WHERE s.recolector_id=$1 AND s.tipo_entrega='delivery' AND s.estado='completada' ORDER BY s.creado_en DESC",
    [recolectorId]
  );
  return res.rows;
}
