"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crearResenaEmpresa = crearResenaEmpresa;
exports.crearResenaUsuario = crearResenaUsuario;
exports.existeResenaEmpresa = existeResenaEmpresa;
exports.existeResenaUsuario = existeResenaUsuario;
exports.listarResenasEmpresa = listarResenasEmpresa;
exports.listarResenasUsuario = listarResenasUsuario;
exports.crearResenaRecolector = crearResenaRecolector;
exports.existeResenaRecolector = existeResenaRecolector;
exports.listarResenasRecolector = listarResenasRecolector;
exports.crearResenaEmpresaPorRecolector = crearResenaEmpresaPorRecolector;
exports.existeResenaEmpresaPorRecolector = existeResenaEmpresaPorRecolector;
exports.crearResenaUsuarioPorRecolector = crearResenaUsuarioPorRecolector;
exports.existeResenaUsuarioPorRecolector = existeResenaUsuarioPorRecolector;
const pool_1 = require("../db/pool");
async function crearResenaEmpresa(empresaId, usuarioId, transaccionId, puntaje, mensaje) {
    const res = await pool_1.pool.query("INSERT INTO resenas_empresas(empresa_id, usuario_id, transaccion_id, puntaje, mensaje) VALUES($1,$2,$3,$4,$5) RETURNING *", [empresaId, usuarioId, transaccionId, puntaje, mensaje]);
    return res.rows[0];
}
async function crearResenaUsuario(usuarioId, empresaId, transaccionId, puntaje, mensaje) {
    const res = await pool_1.pool.query("INSERT INTO resenas_usuarios(usuario_id, empresa_id, transaccion_id, puntaje, mensaje) VALUES($1,$2,$3,$4,$5) RETURNING *", [usuarioId, empresaId, transaccionId, puntaje, mensaje]);
    return res.rows[0];
}
async function existeResenaEmpresa(empresaId, usuarioId, transaccionId) {
    const res = await pool_1.pool.query("SELECT 1 FROM resenas_empresas WHERE empresa_id=$1 AND usuario_id=$2 AND transaccion_id=$3 LIMIT 1", [empresaId, usuarioId, transaccionId]);
    return (res.rowCount || 0) > 0;
}
async function existeResenaUsuario(usuarioId, empresaId, transaccionId) {
    const res = await pool_1.pool.query("SELECT 1 FROM resenas_usuarios WHERE usuario_id=$1 AND empresa_id=$2 AND transaccion_id=$3 LIMIT 1", [usuarioId, empresaId, transaccionId]);
    return (res.rowCount || 0) > 0;
}
async function listarResenasEmpresa(empresaId) {
    const sql = `
    SELECT re.id, re.puntaje, re.mensaje, re.creado_en, re.transaccion_id,
           'usuario' AS autor_rol,
           COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.nombre,''),' ',COALESCE(u.apellidos,''))),''), u.email, 'Usuario ' || u.id) AS autor_nombre,
           COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.nombre,''),' ',COALESCE(u.apellidos,''))),''), u.email, 'Usuario ' || u.id) AS usuario_nombre,
           COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.nombre,''),' ',COALESCE(u.apellidos,''))),''), TRIM(u.email), u.id::text) AS usuario,
           'Usuario' AS autor_etiqueta,
           CASE
             WHEN NULLIF(TRIM(CONCAT(COALESCE(u.nombre,''),' ',COALESCE(u.apellidos,''))), '') IS NOT NULL THEN 'Usuario ' || TRIM(CONCAT(COALESCE(u.nombre,''),' ',COALESCE(u.apellidos,'')))
             WHEN COALESCE(TRIM(u.email),'') <> '' THEN 'Usuario ' || TRIM(u.email)
             ELSE 'Usuario ' || u.id::text
           END AS autor_texto
    FROM resenas_empresas re
    JOIN usuarios u ON u.id = re.usuario_id
    WHERE re.empresa_id = $1 AND re.estado = true
    UNION ALL
    SELECT rr.id, rr.puntaje, rr.mensaje, rr.creado_en, rr.transaccion_id,
           'recolector' AS autor_rol,
           COALESCE(NULLIF(TRIM(CONCAT(COALESCE(r.nombre,''),' ',COALESCE(r.apellidos,''))),''), r.email, 'Recolector ' || r.id) AS autor_nombre,
           COALESCE(NULLIF(TRIM(CONCAT(COALESCE(r.nombre,''),' ',COALESCE(r.apellidos,''))),''), r.email, 'Recolector ' || r.id) AS usuario_nombre,
           COALESCE(NULLIF(TRIM(CONCAT(COALESCE(r.nombre,''),' ',COALESCE(r.apellidos,''))),''), TRIM(r.email), r.id::text) AS usuario,
           'Recolector' AS autor_etiqueta,
           CASE
             WHEN NULLIF(TRIM(CONCAT(COALESCE(r.nombre,''),' ',COALESCE(r.apellidos,''))), '') IS NOT NULL THEN 'Recolector ' || TRIM(CONCAT(COALESCE(r.nombre,''),' ',COALESCE(r.apellidos,'')))
             WHEN COALESCE(TRIM(r.email),'') <> '' THEN 'Recolector ' || TRIM(r.email)
             ELSE 'Recolector ' || r.id::text
           END AS autor_texto
    FROM resenas_empresas_por_recolector rr
    JOIN recolectores r ON r.id = rr.recolector_id
    WHERE rr.empresa_id = $1 AND rr.estado = true
    ORDER BY creado_en DESC`;
    const res = await pool_1.pool.query(sql, [empresaId]);
    return res.rows;
}
async function listarResenasUsuario(usuarioId) {
    const res = await pool_1.pool.query("SELECT ru.id, ru.puntaje, ru.mensaje, ru.creado_en, ru.transaccion_id, ru.empresa_id, COALESCE(e.nombre, 'Empresa ' || e.id) AS empresa_nombre FROM resenas_usuarios ru JOIN empresas e ON e.id=ru.empresa_id WHERE ru.usuario_id=$1 AND ru.estado=true ORDER BY ru.creado_en DESC", [usuarioId]);
    return res.rows;
}
async function crearResenaRecolector(recolectorId, evaluadorRol, evaluadorId, transaccionId, solicitudId, puntaje, mensaje) {
    const res = await pool_1.pool.query("INSERT INTO resenas_recolectores(recolector_id, evaluador_rol, evaluador_id, transaccion_id, solicitud_id, puntaje, mensaje) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *", [recolectorId, evaluadorRol, evaluadorId, transaccionId, solicitudId, puntaje, mensaje]);
    return res.rows[0];
}
async function existeResenaRecolector(recolectorId, evaluadorRol, evaluadorId, transaccionId) {
    const res = await pool_1.pool.query("SELECT 1 FROM resenas_recolectores WHERE recolector_id=$1 AND evaluador_rol=$2 AND evaluador_id=$3 AND transaccion_id=$4 LIMIT 1", [recolectorId, evaluadorRol, evaluadorId, transaccionId]);
    return (res.rowCount || 0) > 0;
}
async function listarResenasRecolector(recolectorId) {
    const res = await pool_1.pool.query("SELECT rr.id, rr.puntaje, rr.mensaje, rr.creado_en, rr.transaccion_id, rr.solicitud_id, rr.evaluador_rol, rr.evaluador_id FROM resenas_recolectores rr WHERE rr.recolector_id=$1 AND rr.estado=true ORDER BY rr.creado_en DESC", [recolectorId]);
    return res.rows;
}
async function crearResenaEmpresaPorRecolector(empresaId, recolectorId, transaccionId, puntaje, mensaje) {
    const res = await pool_1.pool.query("INSERT INTO resenas_empresas_por_recolector(empresa_id, recolector_id, transaccion_id, puntaje, mensaje) VALUES($1,$2,$3,$4,$5) RETURNING *", [empresaId, recolectorId, transaccionId, puntaje, mensaje]);
    return res.rows[0];
}
async function existeResenaEmpresaPorRecolector(empresaId, recolectorId, transaccionId) {
    const res = await pool_1.pool.query("SELECT 1 FROM resenas_empresas_por_recolector WHERE empresa_id=$1 AND recolector_id=$2 AND transaccion_id=$3 LIMIT 1", [empresaId, recolectorId, transaccionId]);
    return (res.rowCount || 0) > 0;
}
async function crearResenaUsuarioPorRecolector(usuarioId, recolectorId, transaccionId, puntaje, mensaje) {
    const res = await pool_1.pool.query("INSERT INTO resenas_usuarios_por_recolector(usuario_id, recolector_id, transaccion_id, puntaje, mensaje) VALUES($1,$2,$3,$4,$5) RETURNING *", [usuarioId, recolectorId, transaccionId, puntaje, mensaje]);
    return res.rows[0];
}
async function existeResenaUsuarioPorRecolector(usuarioId, recolectorId, transaccionId) {
    const res = await pool_1.pool.query("SELECT 1 FROM resenas_usuarios_por_recolector WHERE usuario_id=$1 AND recolector_id=$2 AND transaccion_id=$3 LIMIT 1", [usuarioId, recolectorId, transaccionId]);
    return (res.rowCount || 0) > 0;
}
