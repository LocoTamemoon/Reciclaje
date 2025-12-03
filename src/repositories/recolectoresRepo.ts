import { pool } from "../db/pool";

export async function actualizarReputacionRecolector(recolectorId: number, puntaje: number) {
  const res = await pool.query(
    "UPDATE recolectores SET reputacion_promedio = ((reputacion_promedio * resenas_recibidas_count) + $1) / (resenas_recibidas_count + 1), resenas_recibidas_count = resenas_recibidas_count + 1 WHERE id=$2 RETURNING *",
    [puntaje, recolectorId]
  );
  return res.rows[0];
}

export async function obtenerRecolector(id: number) {
  const res = await pool.query("SELECT * FROM recolectores WHERE id=$1", [id]);
  return res.rows[0] || null;
}
