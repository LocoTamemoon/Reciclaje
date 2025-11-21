"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crearUsuarioInicial = crearUsuarioInicial;
exports.obtenerUsuario = obtenerUsuario;
exports.incrementarSolicitudesUsuario = incrementarSolicitudesUsuario;
exports.acumularKgYPuntos = acumularKgYPuntos;
exports.actualizarReputacionUsuario = actualizarReputacionUsuario;
exports.upsertUsuarioMaterialTotal = upsertUsuarioMaterialTotal;
exports.obtenerUsuarioPorId = obtenerUsuarioPorId;
exports.redimirPuntosUsuario = redimirPuntosUsuario;
const pool_1 = require("../db/pool");
async function crearUsuarioInicial(lat, lon) {
    const res = await pool_1.pool.query("INSERT INTO usuarios(lat, lon) VALUES($1, $2) RETURNING *", [lat, lon]);
    return res.rows[0];
}
async function obtenerUsuario(id) {
    const res = await pool_1.pool.query("SELECT * FROM usuarios WHERE id=$1", [id]);
    return res.rows[0] || null;
}
async function incrementarSolicitudesUsuario(usuarioId) {
    await pool_1.pool.query("UPDATE usuarios SET solicitudes_count = solicitudes_count + 1 WHERE id=$1", [usuarioId]);
}
async function acumularKgYPuntos(usuarioId, kg, puntos) {
    await pool_1.pool.query("UPDATE usuarios SET kg_totales = kg_totales + $1, puntos_acumulados = puntos_acumulados + $2 WHERE id=$3", [kg, puntos, usuarioId]);
}
async function actualizarReputacionUsuario(usuarioId, puntaje) {
    const res = await pool_1.pool.query("UPDATE usuarios SET reputacion_promedio = ((reputacion_promedio * resenas_recibidas_count) + $1) / (resenas_recibidas_count + 1), resenas_recibidas_count = resenas_recibidas_count + 1 WHERE id=$2 RETURNING *", [puntaje, usuarioId]);
    return res.rows[0];
}
async function upsertUsuarioMaterialTotal(usuarioId, materialId, kg) {
    const client = await pool_1.pool.connect();
    try {
        await client.query("BEGIN");
        const row = await client.query("SELECT id FROM usuario_materiales_totales WHERE usuario_id=$1 AND material_id=$2", [usuarioId, materialId]);
        if (row.rows.length === 0) {
            await client.query("INSERT INTO usuario_materiales_totales(usuario_id, material_id, kg_totales) VALUES($1, $2, $3)", [usuarioId, materialId, kg]);
        }
        else {
            await client.query("UPDATE usuario_materiales_totales SET kg_totales = kg_totales + $3 WHERE usuario_id=$1 AND material_id=$2", [usuarioId, materialId, kg]);
        }
        await client.query("COMMIT");
    }
    catch (e) {
        await client.query("ROLLBACK");
        throw e;
    }
    finally {
        client.release();
    }
}
async function obtenerUsuarioPorId(id) {
    const res = await pool_1.pool.query("SELECT * FROM usuarios WHERE id=$1", [id]);
    return res.rows[0] || null;
}
async function redimirPuntosUsuario(usuarioId, puntos) {
    const client = await pool_1.pool.connect();
    try {
        await client.query("BEGIN");
        const cur = await client.query("SELECT puntos_acumulados FROM usuarios WHERE id=$1 FOR UPDATE", [usuarioId]);
        if (cur.rows.length === 0)
            throw new Error("usuario_not_found");
        const actual = Number(cur.rows[0].puntos_acumulados) || 0;
        if (actual < puntos)
            throw new Error("insufficient_points");
        await client.query("UPDATE usuarios SET puntos_acumulados = puntos_acumulados - $2 WHERE id=$1", [usuarioId, puntos]);
        await client.query("COMMIT");
        return { nuevo_puntos: actual - puntos };
    }
    catch (e) {
        await client.query("ROLLBACK");
        throw e;
    }
    finally {
        client.release();
    }
}
