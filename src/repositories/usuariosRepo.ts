import { pool } from "../db/pool";

export async function crearUsuarioInicial(lat: number | null, lon: number | null) {
  const res = await pool.query(
    "INSERT INTO usuarios(home_lat, home_lon) VALUES($1, $2) RETURNING *",
    [lat, lon]
  );
  return res.rows[0];
}

export async function obtenerUsuario(id: number) {
  const res = await pool.query("SELECT * FROM usuarios WHERE id=$1", [id]);
  return res.rows[0] || null;
}

export async function incrementarSolicitudesUsuario(usuarioId: number) {
  await pool.query(
    "UPDATE usuarios SET solicitudes_count = solicitudes_count + 1 WHERE id=$1",
    [usuarioId]
  );
}

export async function acumularKgYPuntos(usuarioId: number, kg: number, puntos: number) {
  await pool.query(
    "UPDATE usuarios SET kg_totales = kg_totales + $1, puntos_acumulados = puntos_acumulados + $2 WHERE id=$3",
    [kg, puntos, usuarioId]
  );
}

export async function actualizarReputacionUsuario(usuarioId: number, puntaje: number) {
  const res = await pool.query(
    "UPDATE usuarios SET reputacion_promedio = ((reputacion_promedio * resenas_recibidas_count) + $1) / (resenas_recibidas_count + 1), resenas_recibidas_count = resenas_recibidas_count + 1 WHERE id=$2 RETURNING *",
    [puntaje, usuarioId]
  );
  return res.rows[0];
}

export async function upsertUsuarioMaterialTotal(usuarioId: number, materialId: number, kg: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const row = await client.query(
      "SELECT id FROM usuario_materiales_totales WHERE usuario_id=$1 AND material_id=$2",
      [usuarioId, materialId]
    );
    if (row.rows.length === 0) {
      await client.query(
        "INSERT INTO usuario_materiales_totales(usuario_id, material_id, kg_totales) VALUES($1, $2, $3)",
        [usuarioId, materialId, kg]
      );
    } else {
      await client.query(
        "UPDATE usuario_materiales_totales SET kg_totales = kg_totales + $3 WHERE usuario_id=$1 AND material_id=$2",
        [usuarioId, materialId, kg]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function obtenerUsuarioPorId(id: number) {
  const res = await pool.query("SELECT * FROM usuarios WHERE id=$1", [id]);
  return res.rows[0] || null;
}

export async function redimirPuntosUsuario(usuarioId: number, puntos: number, rewardKey: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query("SELECT puntos_acumulados FROM usuarios WHERE id=$1 FOR UPDATE", [usuarioId]);
    if (cur.rows.length === 0) throw new Error("usuario_not_found");
    const actual = Number(cur.rows[0].puntos_acumulados) || 0;
    if (actual < puntos) throw new Error("insufficient_points");
    await client.query("UPDATE usuarios SET puntos_acumulados = puntos_acumulados - $2 WHERE id=$1", [usuarioId, puntos]);
    await client.query(
      "INSERT INTO usuario_puntos_gastos(usuario_id, reward_key, puntos) VALUES($1,$2,$3)",
      [usuarioId, rewardKey, puntos]
    );
    await client.query("COMMIT");
    return { nuevo_puntos: actual - puntos };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function actualizarUbicacionActualUsuario(usuarioId: number, lat: number, lon: number) {
  const res = await pool.query(
    "UPDATE usuarios SET current_lat=$2, current_lon=$3 WHERE id=$1 RETURNING *",
    [usuarioId, lat, lon]
  );
  return res.rows[0] || null;
}
