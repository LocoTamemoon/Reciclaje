import { pool } from "../db/pool";

export type PesajeItem = { material_id: number; kg_finales: number };

export async function crearTransaccionConPesaje(
  solicitudId: number,
  usuarioId: number,
  empresaId: number,
  metodoPago: string,
  lat: number | null,
  lon: number | null,
  pesajes: PesajeItem[],
  precios: Map<number, number>,
  puntosPor10kg: number
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let totalKg = 0;
    let monto = 0;
    for (const p of pesajes) {
      const precio = precios.get(p.material_id) || 0;
      totalKg += p.kg_finales;
      monto += p.kg_finales * precio;
    }
    const puntos = Math.floor(totalKg / 10) * puntosPor10kg;
    const tx = await client.query(
      "INSERT INTO transacciones(solicitud_id, usuario_id, empresa_id, monto_pagado, metodo_pago, lat, lon, puntos_obtenidos) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
      [solicitudId, usuarioId, empresaId, monto, metodoPago, lat, lon, puntos]
    );
    const transaccion = tx.rows[0];
    for (const p of pesajes) {
      await client.query(
        "INSERT INTO pesajes(transaccion_id, material_id, kg_finales) VALUES($1,$2,$3)",
        [transaccion.id, p.material_id, p.kg_finales]
      );
    }
    await client.query("COMMIT");
    return { transaccion, totalKg, puntos };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function historialUsuario(usuarioId: number) {
  const res = await pool.query(
    "SELECT t.*, e.nombre AS empresa_nombre FROM transacciones t JOIN empresas e ON e.id=t.empresa_id WHERE t.usuario_id=$1 ORDER BY t.fecha DESC",
    [usuarioId]
  );
  return res.rows;
}

export async function historialEmpresa(empresaId: number) {
  const res = await pool.query(
    "SELECT t.* FROM transacciones t WHERE t.empresa_id=$1 ORDER BY t.fecha DESC",
    [empresaId]
  );
  return res.rows;
}

export async function obtenerTransaccion(id: number) {
  const res = await pool.query(
    "SELECT t.*, e.nombre AS empresa_nombre FROM transacciones t JOIN empresas e ON e.id=t.empresa_id WHERE t.id=$1",
    [id]
  );
  return res.rows[0] || null;
}

export async function obtenerPesajesTransaccion(transaccionId: number) {
  const res = await pool.query(
    "SELECT p.material_id, m.nombre, p.kg_finales FROM pesajes p JOIN materiales m ON m.id=p.material_id WHERE p.transaccion_id=$1 ORDER BY m.nombre",
    [transaccionId]
  );
  return res.rows;
}