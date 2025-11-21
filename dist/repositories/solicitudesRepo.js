"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crearSolicitud = crearSolicitud;
exports.obtenerSolicitud = obtenerSolicitud;
exports.solicitudesPendientesEmpresa = solicitudesPendientesEmpresa;
exports.actualizarEstadoSolicitud = actualizarEstadoSolicitud;
exports.guardarItemsSolicitudJSON = guardarItemsSolicitudJSON;
const pool_1 = require("../db/pool");
async function crearSolicitud(usuarioId, empresaId) {
    const res = await pool_1.pool.query("INSERT INTO solicitudes(usuario_id, empresa_id, estado) VALUES($1, $2, 'pendiente_empresa') RETURNING *", [usuarioId, empresaId]);
    return res.rows[0];
}
async function obtenerSolicitud(id) {
    const res = await pool_1.pool.query("SELECT * FROM solicitudes WHERE id=$1", [id]);
    return res.rows[0] || null;
}
async function solicitudesPendientesEmpresa(empresaId) {
    const res = await pool_1.pool.query("SELECT * FROM solicitudes WHERE empresa_id=$1 AND estado='pendiente_empresa' ORDER BY creado_en DESC", [empresaId]);
    return res.rows;
}
async function actualizarEstadoSolicitud(id, estado) {
    const res = await pool_1.pool.query("UPDATE solicitudes SET estado=$2 WHERE id=$1 RETURNING *", [id, estado]);
    return res.rows[0];
}
async function guardarItemsSolicitudJSON(id, items) {
    await pool_1.pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS items_json jsonb");
    const res = await pool_1.pool.query("UPDATE solicitudes SET items_json=$2 WHERE id=$1 RETURNING *", [id, JSON.stringify(items)]);
    return res.rows[0];
}
