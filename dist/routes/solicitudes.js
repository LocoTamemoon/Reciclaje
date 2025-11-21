"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.solicitudesRouter = void 0;
const express_1 = require("express");
const solicitudesService_1 = require("../services/solicitudesService");
const asyncHandler_1 = require("../middleware/asyncHandler");
exports.solicitudesRouter = (0, express_1.Router)();
exports.solicitudesRouter.post("/", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { usuario_id, empresa_id } = req.body;
    const s = await (0, solicitudesService_1.crearNuevaSolicitud)(Number(usuario_id), Number(empresa_id));
    res.json(s);
}));
