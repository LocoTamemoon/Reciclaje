"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crearSolicitud = crearSolicitud;
exports.crearSolicitudDelivery = crearSolicitudDelivery;
exports.obtenerSolicitud = obtenerSolicitud;
exports.solicitudesPendientesEmpresa = solicitudesPendientesEmpresa;
exports.actualizarEstadoSolicitud = actualizarEstadoSolicitud;
exports.aceptarPorRecolector = aceptarPorRecolector;
exports.actualizarEstadoOperativo = actualizarEstadoOperativo;
exports.listarSolicitudesPublicadas = listarSolicitudesPublicadas;
exports.guardarItemsSolicitudJSON = guardarItemsSolicitudJSON;
exports.historialRecolector = historialRecolector;
const pool_1 = require("../db/pool");
async function crearSolicitud(usuarioId, empresaId) {
    const res = await pool_1.pool.query("INSERT INTO solicitudes(usuario_id, empresa_id, estado) VALUES($1, $2, 'pendiente_empresa') RETURNING *", [usuarioId, empresaId]);
    return res.rows[0];
}
async function crearSolicitudDelivery(usuarioId, empresaId, deliveryFee, clasificacion, consent, termsVersion) {
    const res = await pool_1.pool.query("INSERT INTO solicitudes(usuario_id, empresa_id, estado, tipo_entrega, estado_publicacion, delivery_fee, clasificacion_distancia, delivery_consent, delivery_terms_version) VALUES($1,$2,'pendiente_empresa','delivery','publicada',$3,$4,$5,$6) RETURNING *", [usuarioId, empresaId, deliveryFee, clasificacion, consent, termsVersion]);
    return res.rows[0];
}
async function obtenerSolicitud(id) {
    const res = await pool_1.pool.query("SELECT * FROM solicitudes WHERE id=$1", [id]);
    return res.rows[0] || null;
}
async function solicitudesPendientesEmpresa(empresaId) {
    const res = await pool_1.pool.query("SELECT * FROM solicitudes WHERE empresa_id=$1 AND estado='pendiente_empresa' AND NOT (tipo_entrega='delivery' AND (estado_publicacion IS NULL OR estado_publicacion <> 'aceptada_recolector')) ORDER BY creado_en DESC", [empresaId]);
    return res.rows;
}
async function actualizarEstadoSolicitud(id, estado) {
    const res = await pool_1.pool.query("UPDATE solicitudes SET estado=$2 WHERE id=$1 RETURNING *", [id, estado]);
    return res.rows[0];
}
async function aceptarPorRecolector(id, recolectorId) {
    const res = await pool_1.pool.query("UPDATE solicitudes SET estado_publicacion='aceptada_recolector', recolector_id=$2 WHERE id=$1 AND estado_publicacion='publicada' RETURNING *", [id, recolectorId]);
    return res.rows[0] || null;
}
async function actualizarEstadoOperativo(id, estado) {
    const res = await pool_1.pool.query("UPDATE solicitudes SET estado_operativo=$2 WHERE id=$1 RETURNING *", [id, estado]);
    return res.rows[0];
}
async function listarSolicitudesPublicadas() {
    const res = await pool_1.pool.query("SELECT * FROM solicitudes WHERE tipo_entrega='delivery' AND estado_publicacion='publicada' ORDER BY creado_en DESC");
    return res.rows;
}
async function guardarItemsSolicitudJSON(id, items) {
    await pool_1.pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS items_json jsonb");
    const res = await pool_1.pool.query("UPDATE solicitudes SET items_json=$2 WHERE id=$1 RETURNING *", [id, JSON.stringify(items)]);
    return res.rows[0];
}
async function historialRecolector(recolectorId) {
    const res = await pool_1.pool.query("SELECT s.id, s.usuario_id, u.email AS usuario_email, s.empresa_id, e.nombre AS empresa_nombre, s.delivery_fee, s.clasificacion_distancia, s.creado_en, s.estado FROM solicitudes s JOIN usuarios u ON u.id=s.usuario_id JOIN empresas e ON e.id=s.empresa_id WHERE s.recolector_id=$1 AND s.tipo_entrega='delivery' AND s.estado='completada' ORDER BY s.creado_en DESC", [recolectorId]);
    return res.rows;
}
