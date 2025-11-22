import { pool } from "../db/pool";

export async function listarEmpresas() {
  const empresas = await pool.query(
    "SELECT e.*, COALESCE(cm.materiales, '[]') AS materiales FROM empresas e LEFT JOIN (SELECT empresa_id, JSON_AGG(JSON_BUILD_OBJECT('material_id', material_id, 'precio_por_kg', precio_por_kg)) AS materiales FROM empresa_materiales_precio GROUP BY empresa_id) cm ON cm.empresa_id = e.id ORDER BY e.id"
  );
  return empresas.rows;
}

export async function obtenerEmpresa(id: number) {
  const res = await pool.query("SELECT * FROM empresas WHERE id=$1", [id]);
  return res.rows[0] || null;
}

export async function materialesDeEmpresa(id: number) {
  const res = await pool.query(
    "SELECT emp.material_id, m.nombre, emp.precio_por_kg, emp.condiciones FROM empresa_materiales_precio emp JOIN materiales m ON m.id=emp.material_id WHERE emp.empresa_id=$1 ORDER BY m.nombre",
    [id]
  );
  return res.rows;
}

export async function actualizarReputacionEmpresa(empresaId: number, puntaje: number) {
  const res = await pool.query(
    "UPDATE empresas SET reputacion_promedio = ((reputacion_promedio * resenas_recibidas_count) + $1) / (resenas_recibidas_count + 1), resenas_recibidas_count = resenas_recibidas_count + 1 WHERE id=$2 RETURNING *",
    [puntaje, empresaId]
  );
  return res.rows[0];
}

export async function crearEmpresa(
  ruc: string,
  nombre: string,
  logo: string | null,
  lat: number | null,
  lon: number | null
) {
  const res = await pool.query(
    "INSERT INTO empresas(ruc, nombre, logo, lat, lon) VALUES($1,$2,$3,$4,$5) RETURNING *",
    [ruc, nombre, logo, lat, lon]
  );
  return res.rows[0];
}

export async function actualizarUbicacionEmpresaPorRuc(ruc: string, lat: number, lon: number) {
  const res = await pool.query(
    "UPDATE empresas SET lat=$2, lon=$3 WHERE ruc=$1 RETURNING *",
    [ruc, lat, lon]
  );
  return res.rows[0] || null;
}