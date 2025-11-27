"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recolectorRouter = void 0;
const express_1 = require("express");
const asyncHandler_1 = require("../middleware/asyncHandler");
const solicitudesRepo_1 = require("../repositories/solicitudesRepo");
const transaccionesRepo_1 = require("../repositories/transaccionesRepo");
const usuariosRepo_1 = require("../repositories/usuariosRepo");
const empresasRepo_1 = require("../repositories/empresasRepo");
const pool_1 = require("../db/pool");
exports.recolectorRouter = (0, express_1.Router)();
exports.recolectorRouter.get("/feed", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const list = await (0, solicitudesRepo_1.listarSolicitudesPublicadas)();
    res.json(list);
}));
exports.recolectorRouter.post("/:sid/aceptar", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const sid = Number(req.params.sid);
    const { recolector_id } = req.body;
    const s = await (0, solicitudesRepo_1.aceptarPorRecolector)(sid, Number(recolector_id));
    if (!s) {
        res.status(409).json({ error: "no_disponible" });
        return;
    }
    res.json(s);
}));
exports.recolectorRouter.post("/:sid/estado", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const sid = Number(req.params.sid);
    const { estado } = req.body;
    const s = await (0, solicitudesRepo_1.actualizarEstadoOperativo)(sid, String(estado));
    res.json(s);
}));
exports.recolectorRouter.post("/:sid/items", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const sid = Number(req.params.sid);
    const items = Array.isArray(req.body?.items) ? req.body.items.map((it) => ({ material_id: Number(it.material_id), kg: Number(it.kg) })) : [];
    const s = await (0, solicitudesRepo_1.guardarItemsSolicitudJSON)(sid, items);
    res.json(s);
}));
exports.recolectorRouter.get("/:id/historial", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const list = await (0, solicitudesRepo_1.historialRecolector)(id);
    res.json(list);
}));
function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = (x) => (x * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
exports.recolectorRouter.get("/previsualizacion/:sid", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const sid = Number(req.params.sid);
    const s = await (0, solicitudesRepo_1.obtenerSolicitud)(sid);
    if (!s) {
        res.status(404).json({ error: "not_found" });
        return;
    }
    const usuario = await (0, usuariosRepo_1.obtenerUsuario)(Number(s.usuario_id));
    const empresa = await (0, empresasRepo_1.obtenerEmpresa)(Number(s.empresa_id));
    const rlatlon = await pool_1.pool.query("SELECT lat, lon FROM recolectores WHERE id=$1", [Number(s.recolector_id)]);
    const recolector = rlatlon.rows[0] || null;
    const uLat = usuario?.lat !== null && usuario?.lat !== undefined ? Number(usuario.lat) : null;
    const uLon = usuario?.lon !== null && usuario?.lon !== undefined ? Number(usuario.lon) : null;
    const eLat = empresa?.lat !== null && empresa?.lat !== undefined ? Number(empresa.lat) : null;
    const eLon = empresa?.lon !== null && empresa?.lon !== undefined ? Number(empresa.lon) : null;
    const rLat = recolector?.lat !== null && recolector?.lat !== undefined ? Number(recolector.lat) : null;
    const rLon = recolector?.lon !== null && recolector?.lon !== undefined ? Number(recolector.lon) : null;
    const distRU = (rLat != null && rLon != null && uLat != null && uLon != null) ? haversineKm(rLat, rLon, uLat, uLon) : null;
    const distUE = (uLat != null && uLon != null && eLat != null && eLon != null) ? haversineKm(uLat, uLon, eLat, eLon) : null;
    res.json({
        solicitud_id: sid,
        usuario: { lat: uLat, lon: uLon },
        empresa: { lat: eLat, lon: eLon },
        usuario_nombre: usuario?.nombre || usuario?.email || `Usuario #${s.usuario_id}`,
        empresa_nombre: empresa?.nombre || `Empresa #${s.empresa_id}`,
        recolector: { lat: rLat, lon: rLon },
        dist_recolector_usuario_km: distRU,
        dist_usuario_empresa_km: distUE
    });
}));
exports.recolectorRouter.get("/trabajos/:sid/detalle", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const sid = Number(req.params.sid);
    const s = await (0, solicitudesRepo_1.obtenerSolicitud)(sid);
    if (!s) {
        res.status(404).json({ error: "not_found" });
        return;
    }
    const tx = await (0, transaccionesRepo_1.obtenerTransaccionPorSolicitud)(sid);
    if (!tx) {
        res.status(404).json({ error: "tx_not_found" });
        return;
    }
    const pesajes = await (0, transaccionesRepo_1.obtenerPesajesTransaccion)(Number(tx.id));
    const totalKg = pesajes.reduce((a, p) => a + Number(p.kg_finales || 0), 0);
    const usuario = await (0, usuariosRepo_1.obtenerUsuario)(Number(s.usuario_id));
    const empresa = await (0, empresasRepo_1.obtenerEmpresa)(Number(s.empresa_id));
    const recoRow = await pool_1.pool.query("SELECT lat, lon FROM recolectores WHERE id=$1", [Number(s.recolector_id)]);
    const recolector = recoRow.rows[0] || null;
    const uLat = usuario?.lat !== null && usuario?.lat !== undefined ? Number(usuario.lat) : NaN;
    const uLon = usuario?.lon !== null && usuario?.lon !== undefined ? Number(usuario.lon) : NaN;
    const eLat = empresa?.lat !== null && empresa?.lat !== undefined ? Number(empresa.lat) : NaN;
    const eLon = empresa?.lon !== null && empresa?.lon !== undefined ? Number(empresa.lon) : NaN;
    const rLat = recolector?.lat !== null && recolector?.lat !== undefined ? Number(recolector.lat) : NaN;
    const rLon = recolector?.lon !== null && recolector?.lon !== undefined ? Number(recolector.lon) : NaN;
    const distRU = (!isNaN(rLat) && !isNaN(rLon) && !isNaN(uLat) && !isNaN(uLon)) ? haversineKm(rLat, rLon, uLat, uLon) : null;
    const distUE = (!isNaN(uLat) && !isNaN(uLon) && !isNaN(eLat) && !isNaN(eLon)) ? haversineKm(uLat, uLon, eLat, eLon) : null;
    res.json({
        solicitud_id: sid,
        materiales: pesajes,
        total_kg: totalKg,
        clasificacion: s.clasificacion_distancia,
        dist_recolector_usuario_km: distRU,
        dist_usuario_empresa_km: distUE
    });
}));
exports.recolectorRouter.post("/stats/recompute_all", (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
    const idsRes = await pool_1.pool.query("SELECT id FROM recolectores");
    const updated = [];
    for (const r of idsRes.rows) {
        const id = Number(r.id);
        const cRes = await pool_1.pool.query("SELECT COUNT(*)::int AS c FROM solicitudes WHERE recolector_id=$1 AND tipo_entrega='delivery' AND estado='completada'", [id]);
        const c = Number((cRes.rows[0] || {}).c || 0);
        await pool_1.pool.query("UPDATE recolectores SET trabajos_completados=$2 WHERE id=$1", [id, c]);
        updated.push({ id, trabajos_completados: c });
    }
    res.json({ updated });
}));
