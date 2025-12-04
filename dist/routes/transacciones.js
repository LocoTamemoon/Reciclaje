"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
    const origItems = Array.isArray(solicitud?.items_json) ? solicitud.items_json : [];
    const origMap = new Map();
    for (const it of origItems) {
        try {
            origMap.set(Number(it.material_id), Number(it.kg || 0));
        }
        catch { }
    }
    let empresaCambioValores = false;
    const seen = new Set();
    for (const d of detalle) {
        const mid = Number(d.material_id);
        seen.add(mid);
        const origKg = origMap.has(mid) ? Number(origMap.get(mid)) : 0;
        if (Math.abs(Number(d.kg_finales) - origKg) > 1e-6) {
            empresaCambioValores = true;
            break;
        }
    }
    if (!empresaCambioValores) {
        for (const [mid, kg] of origMap.entries()) {
            if (!seen.has(Number(mid)) && Math.abs(Number(kg)) > 1e-6) {
                empresaCambioValores = true;
                break;
            }
        }
    }
    const esDelivery = String(solicitud?.tipo_entrega || '') === 'delivery';
    const delivery_fee = esDelivery ? Number(solicitud?.delivery_fee || 0) : 0;
    const usuario_neto = total - delivery_fee;
    const ya_resena_usuario = await (0, resenasRepo_1.existeResenaUsuario)(Number(tx.usuario_id), Number(tx.empresa_id), id);
    const ya_resena_empresa = await (0, resenasRepo_1.existeResenaEmpresa)(Number(tx.empresa_id), Number(tx.usuario_id), id);
    const recoFinalId = solicitud?.recolector_id != null ? Number(solicitud.recolector_id) : null;
    let ya_resena_recolector_empresa = false;
    let ya_resena_recolector_usuario = false;
    if (recoFinalId && !Number.isNaN(recoFinalId) && recoFinalId > 0) {
        ya_resena_recolector_empresa = await (0, resenasRepo_1.existeResenaRecolector)(recoFinalId, 'empresa', Number(tx.empresa_id), id);
        ya_resena_recolector_usuario = await (0, resenasRepo_1.existeResenaRecolector)(recoFinalId, 'usuario', Number(tx.usuario_id), id);
    }
    res.json({ transaccion: tx, detalle, total, delivery_fee, usuario_neto, comision_10, total_con_comision, ya_resena_usuario, ya_resena_empresa, ya_resena_recolector_empresa, ya_resena_recolector_usuario, recolector_final_id: recoFinalId, es_delivery: esDelivery, empresa_cambio_valores: empresaCambioValores });
}));
exports.transaccionesRouter.get("/por_solicitud/:sid", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const sid = Number(req.params.sid);
    const tx = await (await Promise.resolve().then(() => __importStar(require("../repositories/transaccionesRepo")))).obtenerTransaccionPorSolicitud(sid);
    if (!tx) {
        res.status(404).json({ error: "not_found" });
        return;
    }
    const pesajes = await (0, transaccionesRepo_1.obtenerPesajesTransaccion)(Number(tx.id));
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
    const origItems = Array.isArray(solicitud?.items_json) ? solicitud.items_json : [];
    const origMap = new Map();
    for (const it of origItems) {
        try {
            origMap.set(Number(it.material_id), Number(it.kg || 0));
        }
        catch { }
    }
    let empresaCambioValores = false;
    const seen = new Set();
    for (const d of detalle) {
        const mid = Number(d.material_id);
        seen.add(mid);
        const origKg = origMap.has(mid) ? Number(origMap.get(mid)) : 0;
        if (Math.abs(Number(d.kg_finales) - origKg) > 1e-6) {
            empresaCambioValores = true;
            break;
        }
    }
    if (!empresaCambioValores) {
        for (const [mid, kg] of origMap.entries()) {
            if (!seen.has(Number(mid)) && Math.abs(Number(kg)) > 1e-6) {
                empresaCambioValores = true;
                break;
            }
        }
    }
    const esDelivery = String(solicitud?.tipo_entrega || '') === 'delivery';
    const delivery_fee = esDelivery ? Number(solicitud?.delivery_fee || 0) : 0;
    const usuario_neto = total - delivery_fee;
    res.json({ transaccion: tx, detalle, total, delivery_fee, usuario_neto, comision_10, total_con_comision, es_delivery: esDelivery, empresa_cambio_valores: empresaCambioValores });
}));
