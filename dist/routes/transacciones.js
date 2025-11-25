"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transaccionesRouter = void 0;
const express_1 = require("express");
const asyncHandler_1 = require("../middleware/asyncHandler");
const transaccionesRepo_1 = require("../repositories/transaccionesRepo");
const solicitudesRepo_1 = require("../repositories/solicitudesRepo");
const resenasRepo_1 = require("../repositories/resenasRepo");
const empresasRepo_1 = require("../repositories/empresasRepo");
exports.transaccionesRouter = (0, express_1.Router)();
exports.transaccionesRouter.get("/:id", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const tx = await (0, transaccionesRepo_1.obtenerTransaccion)(id);
    if (!tx) {
        res.status(404).json({ error: "not_found" });
        return;
    }
    const pesajes = await (0, transaccionesRepo_1.obtenerPesajesTransaccion)(id);
    const precios = await (0, empresasRepo_1.materialesDeEmpresa)(Number(tx.empresa_id));
    const precioMap = new Map();
    for (const p of precios)
        precioMap.set(Number(p.material_id), Number(p.precio_por_kg));
    const detalle = pesajes.map((p) => {
        const precio = precioMap.get(Number(p.material_id)) || 0;
        const subtotal = Number(p.kg_finales) * precio;
        return { material_id: p.material_id, nombre: p.nombre, kg_finales: Number(p.kg_finales), precio_por_kg: precio, subtotal };
    });
    const total = detalle.reduce((a, d) => a + d.subtotal, 0);
    const comision_10 = total * 0.10;
    const total_con_comision = total + comision_10;
    const solicitud = await (0, solicitudesRepo_1.obtenerSolicitud)(Number(tx.solicitud_id));
    const esDelivery = String(solicitud?.tipo_entrega || '') === 'delivery';
    const delivery_fee = esDelivery ? Number(solicitud?.delivery_fee || 0) : 0;
    const usuario_neto = total - delivery_fee;
    const ya_resena_usuario = await (0, resenasRepo_1.existeResenaUsuario)(Number(tx.usuario_id), Number(tx.empresa_id), id);
    const ya_resena_empresa = await (0, resenasRepo_1.existeResenaEmpresa)(Number(tx.empresa_id), Number(tx.usuario_id), id);
    res.json({ transaccion: tx, detalle, total, delivery_fee, usuario_neto, comision_10, total_con_comision, ya_resena_usuario, ya_resena_empresa });
}));
