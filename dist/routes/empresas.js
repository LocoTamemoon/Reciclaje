"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.empresasRouter = void 0;
const express_1 = require("express");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const pool_1 = require("../db/pool");
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
    try {
        const st = await pool_1.pool.query("SELECT estado FROM empresas WHERE id=$1", [id]);
        const activo = Boolean(st.rows[0]?.estado);
        if (!activo) {
            res.status(422).json({ error: "empresa_inactiva" });
            return;
        }
    }
    catch { }
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const results = [];
    for (const it of items) {
        const r = await (0, materialesRepo_1.upsertEmpresaMaterialPrecio)(id, Number(it.material_id), Number(it.precio_por_kg), it.condiciones != null ? String(it.condiciones) : null);
        results.push(r);
    }
    res.json({ updated: results.length });
}));
exports.empresasRouter.delete("/:id/materiales/:mid", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const mid = Number(req.params.mid);
    try {
        const st = await pool_1.pool.query("SELECT estado FROM empresas WHERE id=$1", [id]);
        const activo = Boolean(st.rows[0]?.estado);
        if (!activo) {
            res.status(422).json({ error: "empresa_inactiva" });
            return;
        }
    }
    catch { }
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
    try {
        const st = await pool_1.pool.query("SELECT estado FROM empresas WHERE id=$1", [empresaId]);
        const activo = Boolean(st.rows[0]?.estado);
        if (!activo) {
            res.status(422).json({ error: "empresa_inactiva" });
            return;
        }
    }
    catch { }
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
    try {
        const st = await pool_1.pool.query("SELECT estado FROM empresas WHERE id=$1", [empresaId]);
        const activo = Boolean(st.rows[0]?.estado);
        if (!activo) {
            res.status(422).json({ error: "empresa_inactiva" });
            return;
        }
    }
    catch { }
    const s = await (0, solicitudesService_1.rechazarSolicitud)(empresaId, solicitudId);
    res.json(s);
}));
exports.empresasRouter.post("/:id/solicitudes/:sid/pesaje_pago", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const empresaId = Number(req.params.id);
    const solicitudId = Number(req.params.sid);
    const { usuario_id, metodo_pago, lat, lon, pesajes } = req.body;
    try {
        const st = await pool_1.pool.query("SELECT estado FROM empresas WHERE id=$1", [empresaId]);
        const activo = Boolean(st.rows[0]?.estado);
        if (!activo) {
            res.status(422).json({ error: "empresa_inactiva" });
            return;
        }
    }
    catch { }
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
exports.empresasRouter.get("/:id/perfil", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const eRes = await pool_1.pool.query("SELECT id, ruc, nombre, logo, reputacion_promedio, resenas_recibidas_count, foto_local_1, foto_local_2, foto_local_3 FROM empresas WHERE id=$1", [id]);
    const emp = eRes.rows[0] || null;
    if (!emp) {
        res.status(404).json({ error: "not_found" });
        return;
    }
    const matsRes = await pool_1.pool.query("SELECT COUNT(*)::int AS c FROM empresa_materiales_precio WHERE empresa_id=$1", [id]);
    const txRes = await pool_1.pool.query("SELECT COUNT(*)::int AS c FROM transacciones WHERE empresa_id=$1", [id]);
    res.json({
        empresa: emp,
        stats: {
            transacciones: txRes.rows[0]?.c || 0,
            materiales_activos: matsRes.rows[0]?.c || 0,
            reputacion: Number(emp.reputacion_promedio || 0),
            reseñas: Number(emp.resenas_recibidas_count || 0)
        }
    });
}));
exports.empresasRouter.patch("/:id/perfil", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const nombre = req.body?.nombre != null ? String(req.body.nombre) : null;
    const logoBase64 = req.body?.logo_base64 != null ? String(req.body.logo_base64) : null;
    const f1Base64 = req.body?.foto_local_1_base64 != null ? String(req.body.foto_local_1_base64) : null;
    const f2Base64 = req.body?.foto_local_2_base64 != null ? String(req.body.foto_local_2_base64) : null;
    const f3Base64 = req.body?.foto_local_3_base64 != null ? String(req.body.foto_local_3_base64) : null;
    const dir = path_1.default.resolve("public", "img");
    try {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
    catch { }
    function saveImg(b64) {
        if (!b64)
            return null;
        try {
            const code = Date.now().toString(36);
            const filename = `${id}_empresa_${code}.png`;
            const full = path_1.default.join(dir, filename);
            const data = /^data:image\/(png|jpeg);base64,/i.test(String(b64)) ? String(b64).replace(/^data:image\/(png|jpeg);base64,/i, "") : String(b64);
            const buf = Buffer.from(data, "base64");
            fs_1.default.writeFileSync(full, buf);
            return `/img/${filename}`;
        }
        catch {
            return null;
        }
    }
    const logoPath = saveImg(logoBase64);
    const f1Path = saveImg(f1Base64);
    const f2Path = saveImg(f2Base64);
    const f3Path = saveImg(f3Base64);
    const sets = [];
    const vals = [];
    if (nombre != null) {
        sets.push(`nombre=$${sets.length + 2}`);
        vals.push(nombre);
    }
    if (logoPath) {
        sets.push(`logo=$${sets.length + 2}`);
        vals.push(logoPath);
    }
    if (f1Path) {
        sets.push(`foto_local_1=$${sets.length + 2}`);
        vals.push(f1Path);
    }
    if (f2Path) {
        sets.push(`foto_local_2=$${sets.length + 2}`);
        vals.push(f2Path);
    }
    if (f3Path) {
        sets.push(`foto_local_3=$${sets.length + 2}`);
        vals.push(f3Path);
    }
    if (sets.length === 0) {
        const cur = await pool_1.pool.query("SELECT id, ruc, nombre, logo, reputacion_promedio, resenas_recibidas_count, foto_local_1, foto_local_2, foto_local_3 FROM empresas WHERE id=$1", [id]);
        res.json(cur.rows[0] || null);
        return;
    }
    const sql = `UPDATE empresas SET ${sets.join(", ")} WHERE id=$1 RETURNING id, ruc, nombre, logo, reputacion_promedio, resenas_recibidas_count, foto_local_1, foto_local_2, foto_local_3`;
    const r = await pool_1.pool.query(sql, [id, ...vals]);
    res.json(r.rows[0] || null);
}));
