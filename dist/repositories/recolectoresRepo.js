"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.actualizarReputacionRecolector = actualizarReputacionRecolector;
exports.obtenerRecolector = obtenerRecolector;
const pool_1 = require("../db/pool");
async function actualizarReputacionRecolector(recolectorId, puntaje) {
    const res = await pool_1.pool.query("UPDATE recolectores SET reputacion_promedio = ((reputacion_promedio * resenas_recibidas_count) + $1) / (resenas_recibidas_count + 1), resenas_recibidas_count = resenas_recibidas_count + 1 WHERE id=$2 RETURNING *", [puntaje, recolectorId]);
    return res.rows[0];
}
async function obtenerRecolector(id) {
    const res = await pool_1.pool.query("SELECT * FROM recolectores WHERE id=$1", [id]);
    return res.rows[0] || null;
}
