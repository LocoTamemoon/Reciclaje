"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.solicitudesRouter = void 0;
const express_1 = require("express");
const solicitudesService_1 = require("../services/solicitudesService");
const solicitudesRepo_1 = require("../repositories/solicitudesRepo");
const asyncHandler_1 = require("../middleware/asyncHandler");
exports.solicitudesRouter = (0, express_1.Router)();
exports.solicitudesRouter.post("/", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { usuario_id, empresa_id, items, delivery, delivery_consent, delivery_terms_version, delivery_use_current } = req.body;
    const normalizedItems = Array.isArray(items) ? items.map((it) => ({ material_id: Number(it.material_id), kg: Number(it.kg) })) : [];
    const s = await (0, solicitudesService_1.crearNuevaSolicitud)(Number(usuario_id), Number(empresa_id), normalizedItems, Boolean(delivery), Boolean(delivery_consent), delivery_terms_version ? String(delivery_terms_version) : null, Boolean(delivery_use_current));
    res.json(s);
}));
exports.solicitudesRouter.post("/:sid/cancelar", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const sid = Number(req.params.sid);
    const { usuario_id } = req.body;
    const s = await (0, solicitudesService_1.cancelarSolicitudPorUsuario)(Number(usuario_id), sid);
    res.json(s);
}));
exports.solicitudesRouter.post("/:sid/republish", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const sid = Number(req.params.sid);
    const { usuario_id } = req.body;
    const s = await (0, solicitudesService_1.republicarSolicitudPorUsuario)(Number(usuario_id), sid);
    res.json(s);
}));
exports.solicitudesRouter.get("/:sid", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const sid = Number(req.params.sid);
    const s = await (0, solicitudesRepo_1.obtenerSolicitud)(sid);
    if (!s) {
        res.status(404).json({ error: "not_found" });
        return;
    }
    res.json(s);
}));
