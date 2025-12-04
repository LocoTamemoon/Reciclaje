"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.usuariosRouter = void 0;
const express_1 = require("express");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const transaccionesRepo_1 = require("../repositories/transaccionesRepo");
const pool_1 = require("../db/pool");
const asyncHandler_1 = require("../middleware/asyncHandler");
const usuariosRepo_1 = require("../repositories/usuariosRepo");
const usuariosRepo_2 = require("../repositories/usuariosRepo");
exports.usuariosRouter = (0, express_1.Router)();
exports.usuariosRouter.get("/:id/historial", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const data = await (0, transaccionesRepo_1.historialUsuario)(id);
    res.json(data);
}));
exports.usuariosRouter.get("/:id/dashboard", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const pendientes = await pool_1.pool.query("SELECT * FROM solicitudes WHERE usuario_id=$1 AND ( (tipo_entrega IS DISTINCT FROM 'delivery' AND estado='pendiente_empresa') OR (tipo_entrega='delivery' AND ( (estado='pendiente_delivery' AND estado_publicacion='publicada') OR (estado_publicacion='aceptada_recolector' AND estado IN ('rumbo_usuario','cerca_usuario','rumbo_a_empresa','cerca_empresa')) ) ) ) ORDER BY creado_en DESC", [id]);
    const anteriores = await pool_1.pool.query("SELECT * FROM solicitudes WHERE usuario_id=$1 AND NOT ( (tipo_entrega IS DISTINCT FROM 'delivery' AND estado='pendiente_empresa') OR (tipo_entrega='delivery' AND ( (estado='pendiente_delivery' AND estado_publicacion='publicada') OR (estado_publicacion='aceptada_recolector' AND estado IN ('rumbo_usuario','cerca_usuario','rumbo_a_empresa','cerca_empresa')) ) ) ) ORDER BY creado_en DESC", [id]);
    function etiquetaSolicitud(s) {
        const tipo = String(s?.tipo_entrega || "");
        const estado = String(s?.estado || "");
        const handoffIdRaw = s?.handoff_recolector_id;
        const handoffId = handoffIdRaw != null ? Number(handoffIdRaw) : null;
        const huboHandoff = handoffId != null && !Number.isNaN(handoffId) && handoffId > 0;
        if (tipo === "delivery" && estado === "completada" && !huboHandoff)
            return "completada_delivery";
        if (tipo === "delivery" && estado === "completada" && huboHandoff)
            return "completada_delivery_handoff";
        if (tipo === "delivery" && estado === "completada_repesada" && !huboHandoff)
            return "completada_repesada_delivery";
        if (tipo === "delivery" && estado === "completada_repesada" && huboHandoff)
            return "completada_repesada_delivery_handoff";
        return null;
    }
    const anterioresEtiquetadas = anteriores.rows.map((s) => ({ ...s, etiqueta: etiquetaSolicitud(s) }));
    const historial = await (0, transaccionesRepo_1.historialUsuario)(id);
    res.json({ solicitudes_pendientes: pendientes.rows, solicitudes_anteriores: anterioresEtiquetadas, historial_transacciones: historial });
}));
exports.usuariosRouter.get("/:id/stats", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const total = await pool_1.pool.query("SELECT COALESCE(SUM(monto_pagado),0) AS monto_total FROM transacciones WHERE usuario_id=$1", [id]);
    const row = total.rows[0] || { monto_total: 0 };
    res.json({ monto_total: Number(row.monto_total) });
}));
exports.usuariosRouter.get("/:id/perfil", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const userRes = await pool_1.pool.query("SELECT id, nombre, apellidos, puntos_acumulados, kg_totales, reputacion_promedio, resenas_recibidas_count, foto_perfil_path FROM usuarios WHERE id=$1", [id]);
    const u = userRes.rows[0] || null;
    const matsRes = await pool_1.pool.query("SELECT umt.material_id, m.nombre, umt.kg_totales FROM usuario_materiales_totales umt JOIN materiales m ON m.id=umt.material_id WHERE umt.usuario_id=$1 ORDER BY m.nombre", [id]);
    const resenasRes = await pool_1.pool.query("SELECT ru.id, ru.puntaje, ru.mensaje, ru.creado_en, ru.transaccion_id, ru.empresa_id, COALESCE(e.nombre, 'Empresa ' || e.id) AS empresa_nombre FROM resenas_usuarios ru JOIN empresas e ON e.id=ru.empresa_id WHERE ru.usuario_id=$1 ORDER BY ru.creado_en DESC", [id]);
    res.json({ usuario: u, materiales: matsRes.rows, resenas: resenasRes.rows });
}));
exports.usuariosRouter.patch("/:id/perfil", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const nombre = req.body?.nombre != null ? String(req.body.nombre) : null;
    const apellidos = req.body?.apellidos != null ? String(req.body.apellidos) : null;
    const fotoBase64 = req.body?.foto_base64 != null ? String(req.body.foto_base64) : null;
    let fotoPath = null;
    if (fotoBase64) {
        try {
            const dir = path_1.default.resolve("public", "img");
            try {
                fs_1.default.mkdirSync(dir, { recursive: true });
            }
            catch { }
            const code = Date.now().toString(36);
            const filename = `${id}_usuario_${code}.png`;
            const full = path_1.default.join(dir, filename);
            const data = /^data:image\/(png|jpeg);base64,/i.test(fotoBase64) ? fotoBase64.replace(/^data:image\/(png|jpeg);base64,/i, "") : fotoBase64;
            const buf = Buffer.from(data, "base64");
            fs_1.default.writeFileSync(full, buf);
            fotoPath = `/img/${filename}`;
        }
        catch { }
    }
    const fields = [];
    const vals = [];
    if (nombre != null) {
        fields.push("nombre=$2");
        vals.push(nombre);
    }
    if (apellidos != null) {
        fields.push("apellidos=$" + (vals.length + 2));
        vals.push(apellidos);
    }
    if (fotoPath) {
        fields.push("foto_perfil_path=$" + (vals.length + 2));
        vals.push(fotoPath);
    }
    if (fields.length === 0) {
        const out = await pool_1.pool.query("SELECT id, nombre, apellidos, puntos_acumulados, kg_totales, reputacion_promedio, resenas_recibidas_count, foto_perfil_path FROM usuarios WHERE id=$1", [id]);
        res.json(out.rows[0] || null);
        return;
    }
    const setClause = fields.join(", ");
    const q = `UPDATE usuarios SET ${setClause} WHERE id=$1 RETURNING id, nombre, apellidos, puntos_acumulados, kg_totales, reputacion_promedio, resenas_recibidas_count, foto_perfil_path`;
    const r = await pool_1.pool.query(q, [id, ...vals]);
    res.json(r.rows[0] || null);
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
exports.usuariosRouter.post("/:id/ubicacion_actual", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const { lat, lon } = req.body;
    if (lat === undefined || lon === undefined) {
        res.status(400).json({ error: "invalid_coords" });
        return;
    }
    const u = await (0, usuariosRepo_2.actualizarUbicacionActualUsuario)(id, Number(lat), Number(lon));
    res.json({ ok: true, usuario: u });
}));
