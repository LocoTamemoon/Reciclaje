import { pool } from "../db/pool";

export async function listarMaterialesEmpresa(empresaId: number) {
  const res = await pool.query(
    "SELECT emp.material_id, m.nombre, emp.precio_por_kg, emp.condiciones FROM empresa_materiales_precio emp JOIN materiales m ON m.id=emp.material_id WHERE emp.empresa_id=$1 ORDER BY m.nombre",
    [empresaId]
  );
  return res.rows;
}

export async function listarMaterialesCatalogo() {
  const res = await pool.query(
    "SELECT id, nombre, precio_base_por_kg FROM materiales ORDER BY nombre"
  );
  return res.rows;
}

export async function upsertEmpresaMaterialPrecio(empresaId: number, materialId: number, precio: number) {
  const res = await pool.query(
    "INSERT INTO empresa_materiales_precio(empresa_id, material_id, precio_por_kg) VALUES($1,$2,$3) ON CONFLICT (empresa_id, material_id) DO UPDATE SET precio_por_kg=EXCLUDED.precio_por_kg RETURNING *",
    [empresaId, materialId, precio]
  );
  return res.rows[0];
}

export async function eliminarEmpresaMaterial(empresaId: number, materialId: number) {
  await pool.query(
    "DELETE FROM empresa_materiales_precio WHERE empresa_id=$1 AND material_id=$2",
    [empresaId, materialId]
  );
}