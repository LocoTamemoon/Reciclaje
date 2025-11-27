"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crearTransaccionConPesaje = crearTransaccionConPesaje;
exports.historialUsuario = historialUsuario;
exports.historialEmpresa = historialEmpresa;
exports.obtenerTransaccion = obtenerTransaccion;
exports.obtenerPesajesTransaccion = obtenerPesajesTransaccion;
exports.obtenerTransaccionPorSolicitud = obtenerTransaccionPorSolicitud;
const pool_1 = require("../db/pool");
async function crearTransaccionConPesaje(solicitudId, usuarioId, empresaId, metodoPago, modoEntrega, lat, lon, pesajes, precios, puntosPor10kg) {
    const client = await pool_1.pool.connect();
    try {
        await client.query("BEGIN");
        await client.query("ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS modo_entrega text");
        let totalKg = 0;
        let monto = 0;
        for (const p of pesajes) {
            const precio = precios.get(p.material_id) || 0;
            totalKg += p.kg_finales;
            monto += p.kg_finales * precio;
        }
        const puntos = Math.floor(totalKg / 10) * puntosPor10kg;
        const tx = await client.query("INSERT INTO transacciones(solicitud_id, usuario_id, empresa_id, monto_pagado, metodo_pago, modo_entrega, lat, lon, puntos_obtenidos) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *", [solicitudId, usuarioId, empresaId, monto, metodoPago, modoEntrega, lat, lon, puntos]);
        const transaccion = tx.rows[0];
        for (const p of pesajes) {
            await client.query("INSERT INTO pesajes(transaccion_id, material_id, kg_finales) VALUES($1,$2,$3)", [transaccion.id, p.material_id, p.kg_finales]);
        }
        await client.query("COMMIT");
        return { transaccion, totalKg, puntos };
    }
    catch (e) {
        await client.query("ROLLBACK");
        throw e;
    }
    finally {
        client.release();
    }
}
async function historialUsuario(usuarioId) {
    const res = await pool_1.pool.query("SELECT t.*, e.nombre AS empresa_nombre FROM transacciones t JOIN empresas e ON e.id=t.empresa_id WHERE t.usuario_id=$1 ORDER BY t.fecha DESC", [usuarioId]);
    return res.rows;
}
async function historialEmpresa(empresaId) {
    const res = await pool_1.pool.query("SELECT t.* FROM transacciones t WHERE t.empresa_id=$1 ORDER BY t.fecha DESC", [empresaId]);
    return res.rows;
}
async function obtenerTransaccion(id) {
    const res = await pool_1.pool.query("SELECT t.*, e.nombre AS empresa_nombre FROM transacciones t JOIN empresas e ON e.id=t.empresa_id WHERE t.id=$1", [id]);
    return res.rows[0] || null;
}
async function obtenerPesajesTransaccion(transaccionId) {
    const res = await pool_1.pool.query("SELECT p.material_id, m.nombre, p.kg_finales FROM pesajes p JOIN materiales m ON m.id=p.material_id WHERE p.transaccion_id=$1 ORDER BY m.nombre", [transaccionId]);
    return res.rows;
}
async function obtenerTransaccionPorSolicitud(solicitudId) {
    const res = await pool_1.pool.query("SELECT t.*, e.nombre AS empresa_nombre FROM transacciones t JOIN empresas e ON e.id=t.empresa_id WHERE t.solicitud_id=$1 ORDER BY t.fecha DESC LIMIT 1", [solicitudId]);
    return res.rows[0] || null;
}
