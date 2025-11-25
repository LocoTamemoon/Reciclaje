"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usuariosRouter = void 0;
const express_1 = require("express");
const transaccionesRepo_1 = require("../repositories/transaccionesRepo");
const pool_1 = require("../db/pool");
const asyncHandler_1 = require("../middleware/asyncHandler");
const usuariosRepo_1 = require("../repositories/usuariosRepo");
exports.usuariosRouter = (0, express_1.Router)();
exports.usuariosRouter.get("/:id/historial", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const data = await (0, transaccionesRepo_1.historialUsuario)(id);
    res.json(data);
}));
exports.usuariosRouter.get("/:id/dashboard", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const pendientes = await pool_1.pool.query("SELECT * FROM solicitudes WHERE usuario_id=$1 AND estado='pendiente_empresa' ORDER BY creado_en DESC", [id]);
    const anteriores = await pool_1.pool.query("SELECT * FROM solicitudes WHERE usuario_id=$1 AND estado <> 'pendiente_empresa' ORDER BY creado_en DESC", [id]);
    const historial = await (0, transaccionesRepo_1.historialUsuario)(id);
    res.json({ solicitudes_pendientes: pendientes.rows, solicitudes_anteriores: anteriores.rows, historial_transacciones: historial });
}));
exports.usuariosRouter.get("/:id/stats", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const total = await pool_1.pool.query("SELECT COALESCE(SUM(monto_pagado),0) AS monto_total FROM transacciones WHERE usuario_id=$1", [id]);
    const row = total.rows[0] || { monto_total: 0 };
    res.json({ monto_total: Number(row.monto_total) });
}));
const RECOMPENSAS = [
    { key: 'cinemark_entrada', nombre: 'Entrada de cine Cinemark', costo: 500 },
    { key: 'bembos_vale', nombre: 'Vale hamburguesa Bembos', costo: 320 },
    { key: 'plaza_vea_vale', nombre: 'Vale compras Plaza Vea', costo: 450 },
    { key: 'movilidad_descuento', nombre: 'Descuento en movilidad', costo: 200 }
];
exports.usuariosRouter.get("/recompensas", (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
    res.json(RECOMPENSAS);
}));
exports.usuariosRouter.post("/:id/recompensas/redimir", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const { reward_key } = req.body;
    const r = RECOMPENSAS.find(x => x.key === String(reward_key));
    if (!r) {
        res.status(400).json({ error: 'reward_not_found' });
        return;
    }
    try {
        const out = await (0, usuariosRepo_1.redimirPuntosUsuario)(id, Number(r.costo), String(r.key));
        res.json({ ok: true, nuevo_puntos: out.nuevo_puntos });
    }
    catch (e) {
        if (String(e.message) === 'insufficient_points') {
            res.status(400).json({ error: 'insufficient_points' });
            return;
        }
        res.status(400).json({ error: 'redeem_failed' });
    }
}));
exports.usuariosRouter.get("/:id/puntos/gastos", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const rows = await pool_1.pool.query("SELECT reward_key, puntos, creado_en FROM usuario_puntos_gastos WHERE usuario_id=$1 ORDER BY creado_en DESC", [id]);
    res.json(rows.rows);
}));
