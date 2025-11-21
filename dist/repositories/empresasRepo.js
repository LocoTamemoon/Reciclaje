"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listarEmpresas = listarEmpresas;
exports.obtenerEmpresa = obtenerEmpresa;
exports.materialesDeEmpresa = materialesDeEmpresa;
exports.actualizarReputacionEmpresa = actualizarReputacionEmpresa;
exports.crearEmpresa = crearEmpresa;
const pool_1 = require("../db/pool");
async function listarEmpresas() {
    const empresas = await pool_1.pool.query("SELECT e.*, COALESCE(cm.materiales, '[]') AS materiales FROM empresas e LEFT JOIN (SELECT empresa_id, JSON_AGG(JSON_BUILD_OBJECT('material_id', material_id, 'precio_por_kg', precio_por_kg)) AS materiales FROM empresa_materiales_precio GROUP BY empresa_id) cm ON cm.empresa_id = e.id ORDER BY e.id");
    return empresas.rows;
}
async function obtenerEmpresa(id) {
    const res = await pool_1.pool.query("SELECT * FROM empresas WHERE id=$1", [id]);
    return res.rows[0] || null;
}
async function materialesDeEmpresa(id) {
    const res = await pool_1.pool.query("SELECT emp.material_id, m.nombre, emp.precio_por_kg, emp.condiciones FROM empresa_materiales_precio emp JOIN materiales m ON m.id=emp.material_id WHERE emp.empresa_id=$1 ORDER BY m.nombre", [id]);
    return res.rows;
}
async function actualizarReputacionEmpresa(empresaId, puntaje) {
    const res = await pool_1.pool.query("UPDATE empresas SET reputacion_promedio = ((reputacion_promedio * resenas_recibidas_count) + $1) / (resenas_recibidas_count + 1), resenas_recibidas_count = resenas_recibidas_count + 1 WHERE id=$2 RETURNING *", [puntaje, empresaId]);
    return res.rows[0];
}
async function crearEmpresa(ruc, nombre, logo, lat, lon) {
    const res = await pool_1.pool.query("INSERT INTO empresas(ruc, nombre, logo, lat, lon) VALUES($1,$2,$3,$4,$5) RETURNING *", [ruc, nombre, logo, lat, lon]);
    return res.rows[0];
}
