"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listarMaterialesEmpresa = listarMaterialesEmpresa;
exports.listarMaterialesCatalogo = listarMaterialesCatalogo;
exports.upsertEmpresaMaterialPrecio = upsertEmpresaMaterialPrecio;
exports.eliminarEmpresaMaterial = eliminarEmpresaMaterial;
const pool_1 = require("../db/pool");
async function listarMaterialesEmpresa(empresaId) {
    const res = await pool_1.pool.query("SELECT emp.material_id, m.nombre, emp.precio_por_kg, emp.condiciones FROM empresa_materiales_precio emp JOIN materiales m ON m.id=emp.material_id WHERE emp.empresa_id=$1 ORDER BY m.nombre", [empresaId]);
    return res.rows;
}
async function listarMaterialesCatalogo() {
    const res = await pool_1.pool.query("SELECT id, nombre, precio_base_por_kg FROM materiales ORDER BY nombre");
    return res.rows;
}
async function upsertEmpresaMaterialPrecio(empresaId, materialId, precio, condiciones) {
    const res = await pool_1.pool.query("INSERT INTO empresa_materiales_precio(empresa_id, material_id, precio_por_kg, condiciones) VALUES($1,$2,$3,$4) ON CONFLICT (empresa_id, material_id) DO UPDATE SET precio_por_kg=EXCLUDED.precio_por_kg, condiciones=COALESCE(EXCLUDED.condiciones, empresa_materiales_precio.condiciones) RETURNING *", [empresaId, materialId, precio, condiciones ?? null]);
    return res.rows[0];
}
async function eliminarEmpresaMaterial(empresaId, materialId) {
    await pool_1.pool.query("DELETE FROM empresa_materiales_precio WHERE empresa_id=$1 AND material_id=$2", [empresaId, materialId]);
}
