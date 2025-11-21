"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crearResenaEmpresa = crearResenaEmpresa;
exports.crearResenaUsuario = crearResenaUsuario;
exports.existeResenaEmpresa = existeResenaEmpresa;
exports.existeResenaUsuario = existeResenaUsuario;
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
