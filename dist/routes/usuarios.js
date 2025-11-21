"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usuariosRouter = void 0;
const express_1 = require("express");
const transaccionesRepo_1 = require("../repositories/transaccionesRepo");
const pool_1 = require("../db/pool");
const asyncHandler_1 = require("../middleware/asyncHandler");
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
