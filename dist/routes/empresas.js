"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.empresasRouter = void 0;
const express_1 = require("express");
const empresasRepo_1 = require("../repositories/empresasRepo");
const transaccionesRepo_1 = require("../repositories/transaccionesRepo");
const materialesRepo_1 = require("../repositories/materialesRepo");
const solicitudesRepo_1 = require("../repositories/solicitudesRepo");
const solicitudesService_1 = require("../services/solicitudesService");
const solicitudesRepo_2 = require("../repositories/solicitudesRepo");
const pagosService_1 = require("../services/pagosService");
const asyncHandler_1 = require("../middleware/asyncHandler");
exports.empresasRouter = (0, express_1.Router)();
exports.empresasRouter.get("/", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const data = await (0, empresasRepo_1.listarEmpresas)();
    res.json(data);
}));
exports.empresasRouter.post("/", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { ruc, nombre, logo, lat, lon } = req.body;
    const empresa = await (0, empresasRepo_1.crearEmpresa)(String(ruc), String(nombre), logo ? String(logo) : null, lat !== undefined ? Number(lat) : null, lon !== undefined ? Number(lon) : null);
    res.status(201).json(empresa);
}));
exports.empresasRouter.get("/:id/materiales", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const data = await (0, empresasRepo_1.materialesDeEmpresa)(id);
    res.json(data);
}));
exports.empresasRouter.post("/:id/materiales/upsert", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const results = [];
    for (const it of items) {
        const r = await (0, materialesRepo_1.upsertEmpresaMaterialPrecio)(id, Number(it.material_id), Number(it.precio_por_kg));
        results.push(r);
    }
    res.json({ updated: results.length });
}));
exports.empresasRouter.delete("/:id/materiales/:mid", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const mid = Number(req.params.mid);
    await (0, materialesRepo_1.eliminarEmpresaMaterial)(id, mid);
    res.json({ removed: true });
}));
exports.empresasRouter.get("/:id/solicitudes", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const data = await (0, solicitudesRepo_1.solicitudesPendientesEmpresa)(id);
    res.json(data);
}));
exports.empresasRouter.post("/:id/solicitudes/:sid/aceptar", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const empresaId = Number(req.params.id);
    const solicitudId = Number(req.params.sid);
    const s = await (0, solicitudesService_1.aceptarSolicitud)(empresaId, solicitudId);
    const sol = await (0, solicitudesRepo_2.obtenerSolicitud)(solicitudId);
    const items = Array.isArray(sol?.items_json) ? sol.items_json : [];
    const pesajes = items.map((it) => ({ material_id: Number(it.material_id), kg_finales: Number(it.kg) }));
    const t = await (0, pagosService_1.registrarPesajeYPago)(empresaId, solicitudId, Number(s.usuario_id), "efectivo", null, null, pesajes);
    res.json({ solicitud: s, transaccion: t });
}));
exports.empresasRouter.post("/:id/solicitudes/:sid/rechazar", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const empresaId = Number(req.params.id);
    const solicitudId = Number(req.params.sid);
    const s = await (0, solicitudesService_1.rechazarSolicitud)(empresaId, solicitudId);
    res.json(s);
}));
exports.empresasRouter.post("/:id/solicitudes/:sid/pesaje_pago", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const empresaId = Number(req.params.id);
    const solicitudId = Number(req.params.sid);
    const { usuario_id, metodo_pago, lat, lon, pesajes } = req.body;
    const t = await (0, pagosService_1.registrarPesajeYPago)(empresaId, solicitudId, Number(usuario_id), String(metodo_pago), lat !== undefined ? Number(lat) : null, lon !== undefined ? Number(lon) : null, Array.isArray(pesajes) ? pesajes.map((p) => ({ material_id: Number(p.material_id), kg_finales: Number(p.kg_finales) })) : []);
    res.json(t);
}));
exports.empresasRouter.post("/set_loc", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { ruc, lat, lon } = req.body;
    const e = await (0, empresasRepo_1.actualizarUbicacionEmpresaPorRuc)(String(ruc), Number(lat), Number(lon));
    res.json(e);
}));
exports.empresasRouter.get("/:id/historial", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const list = await (0, transaccionesRepo_1.historialEmpresa)(id);
    res.json(list);
}));
exports.empresasRouter.get("/stats", (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
    const stats = await (0, empresasRepo_1.statsEmpresasTransacciones)();
    res.json(stats);
}));
exports.empresasRouter.get("/stats_distritos", (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
    const stats = await (0, empresasRepo_1.statsDistritosTransacciones)();
    res.json(stats);
}));
