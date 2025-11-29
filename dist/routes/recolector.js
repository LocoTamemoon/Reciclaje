"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recolectorRouter = void 0;
const express_1 = require("express");
const asyncHandler_1 = require("../middleware/asyncHandler");
const solicitudesRepo_1 = require("../repositories/solicitudesRepo");
const solicitudesService_1 = require("../services/solicitudesService");
const transaccionesRepo_1 = require("../repositories/transaccionesRepo");
const usuariosRepo_1 = require("../repositories/usuariosRepo");
const empresasRepo_1 = require("../repositories/empresasRepo");
const pool_1 = require("../db/pool");
exports.recolectorRouter = (0, express_1.Router)();
exports.recolectorRouter.get("/feed", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const list = await (0, solicitudesRepo_1.listarSolicitudesPublicadas)();
    res.json(list);
}));
exports.recolectorRouter.get("/:id/en_curso", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const rows = await pool_1.pool.query("SELECT * FROM solicitudes WHERE recolector_id=$1 AND tipo_entrega='delivery' AND estado_publicacion='aceptada_recolector' AND (estado IS DISTINCT FROM 'completada') ORDER BY creado_en DESC", [id]);
    res.json(rows.rows);
}));
exports.recolectorRouter.post("/:sid/aceptar", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const sid = Number(req.params.sid);
    const { recolector_id, vehiculo_id, lat, lon } = req.body;
    let s = null;
    try {
        s = await (0, solicitudesRepo_1.aceptarPorRecolector)(sid, Number(recolector_id), vehiculo_id != null ? Number(vehiculo_id) : null, lat != null ? Number(lat) : null, lon != null ? Number(lon) : null);
    }
    catch (e) {
        const msg = String(e?.message || '');
        if (msg === 'vehiculo_invalido' || msg === 'capacidad_insuficiente') {
            res.status(422).json({ error: msg });
            return;
        }
        throw e;
    }
    if (!s) {
        res.status(409).json({ error: "no_disponible" });
        return;
    }
    try {
        await (0, solicitudesService_1.recalcularClasificacionYFee)(sid);
    }
    catch { }
    const s2 = await (0, solicitudesRepo_1.obtenerSolicitud)(sid);
    res.json(s2 || s);
}));
exports.recolectorRouter.post(":sid/estado", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const sid = Number(req.params.sid);
    const { estado } = req.body;
    const s = await (0, solicitudesRepo_1.actualizarEstadoOperativo)(sid, String(estado));
    res.json(s);
}));
exports.recolectorRouter.post("/vehiculos", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { recolector_id, tipo, tipo_id, placa, capacidad_kg } = req.body;
    if (!recolector_id || !placa || capacidad_kg == null) {
        res.status(400).json({ error: "invalid_body" });
        return;
    }
    let tipoId = null;
    if (tipo_id != null) {
        const t = await pool_1.pool.query("SELECT id FROM vehiculo_tipos WHERE id=$1 AND activo=true", [Number(tipo_id)]);
        if (!t.rows[0]) {
            res.status(422).json({ error: "tipo_invalido" });
            return;
        }
        tipoId = Number(t.rows[0].id);
    }
    else if (tipo) {
        const t = await pool_1.pool.query("SELECT id FROM vehiculo_tipos WHERE LOWER(nombre)=LOWER($1) AND activo=true", [String(tipo)]);
        if (!t.rows[0]) {
            res.status(422).json({ error: "tipo_invalido" });
            return;
        }
        tipoId = Number(t.rows[0].id);
    }
    else {
        res.status(400).json({ error: "tipo_requerido" });
        return;
    }
    const r = await pool_1.pool.query("INSERT INTO vehiculos(recolector_id, tipo_id, placa, capacidad_kg, activo) VALUES($1,$2,$3,$4,true) RETURNING *", [Number(recolector_id), tipoId, String(placa), Number(capacidad_kg)]);
    res.json(r.rows[0] || null);
}));
exports.recolectorRouter.get("/:id/vehiculos", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const r = await pool_1.pool.query("SELECT * FROM vehiculos WHERE recolector_id=$1 ORDER BY creado_en DESC", [id]);
    res.json(r.rows);
}));
exports.recolectorRouter.patch("/vehiculos/:vid", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const vid = Number(req.params.vid);
    const { recolector_id, capacidad_kg, activo, tipo, tipo_id } = req.body;
    if (!recolector_id) {
        res.status(400).json({ error: "invalid_body" });
        return;
    }
    const owner = await pool_1.pool.query("SELECT id FROM vehiculos WHERE id=$1 AND recolector_id=$2", [vid, Number(recolector_id)]);
    if (!owner.rows[0]) {
        res.status(404).json({ error: "vehiculo_not_found" });
        return;
    }
    let tipoId = tipo_id != null ? Number(tipo_id) : null;
    if (tipo_id != null) {
        const t = await pool_1.pool.query("SELECT id FROM vehiculo_tipos WHERE id=$1 AND activo=true", [Number(tipo_id)]);
        if (!t.rows[0]) {
            res.status(422).json({ error: "tipo_invalido" });
            return;
        }
        tipoId = Number(t.rows[0].id);
    }
    else if (tipo != null) {
        const t = await pool_1.pool.query("SELECT id FROM vehiculo_tipos WHERE LOWER(nombre)=LOWER($1) AND activo=true", [String(tipo)]);
        if (!t.rows[0]) {
            res.status(422).json({ error: "tipo_invalido" });
            return;
        }
        tipoId = Number(t.rows[0].id);
    }
    const r = await pool_1.pool.query("UPDATE vehiculos SET capacidad_kg=COALESCE($3, capacidad_kg), activo=COALESCE($4, activo), tipo_id=COALESCE($5, tipo_id) WHERE id=$1 RETURNING *", [vid, Number(recolector_id), capacidad_kg != null ? Number(capacidad_kg) : null, activo != null ? Boolean(activo) : null, tipoId]);
    res.json(r.rows[0] || null);
}));
exports.recolectorRouter.post("/:id/ubicacion_actual", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const { lat, lon } = req.body;
    if (lat === undefined || lon === undefined) {
        res.status(400).json({ error: "invalid_coords" });
        return;
    }
    const r = await pool_1.pool.query("UPDATE recolectores SET lat=$2, lon=$3 WHERE id=$1 RETURNING *", [id, Number(lat), Number(lon)]);
    res.json({ ok: true, recolector: r.rows[0] || null });
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
    const snapLat = s?.recolector_accept_lat;
    const snapLon = s?.recolector_accept_lon;
    const viewerId = Number(req.query.viewer_id || NaN);
    let recolector = null;
    if (snapLat != null && snapLon != null) {
        recolector = { lat: Number(snapLat), lon: Number(snapLon) };
    }
    else {
        let lookupId = Number(s.recolector_id);
        if (!lookupId || isNaN(lookupId))
            lookupId = !isNaN(viewerId) ? viewerId : NaN;
        if (lookupId && !isNaN(lookupId)) {
            const rlatlon = await pool_1.pool.query("SELECT lat, lon FROM recolectores WHERE id=$1", [lookupId]);
            recolector = rlatlon.rows[0] || null;
        }
    }
    const uHomeLat = (usuario && usuario.home_lat !== undefined && usuario.home_lat !== null)
        ? Number(usuario.home_lat)
        : (usuario && usuario.lat !== undefined && usuario.lat !== null ? Number(usuario.lat) : null);
    const uHomeLon = (usuario && usuario.home_lon !== undefined && usuario.home_lon !== null)
        ? Number(usuario.home_lon)
        : (usuario && usuario.lon !== undefined && usuario.lon !== null ? Number(usuario.lon) : null);
    const uCurLat = (usuario && usuario.current_lat !== undefined && usuario.current_lat !== null)
        ? Number(usuario.current_lat)
        : null;
    const uCurLon = (usuario && usuario.current_lon !== undefined && usuario.current_lon !== null)
        ? Number(usuario.current_lon)
        : null;
    const eLat = empresa?.lat !== null && empresa?.lat !== undefined ? Number(empresa.lat) : null;
    const eLon = empresa?.lon !== null && empresa?.lon !== undefined ? Number(empresa.lon) : null;
    const rLat = recolector?.lat !== null && recolector?.lat !== undefined ? Number(recolector.lat) : null;
    const rLon = recolector?.lon !== null && recolector?.lon !== undefined ? Number(recolector.lon) : null;
    const useCur = Boolean(s?.usuario_pick_actual);
    const uPickLat = useCur && uCurLat != null ? uCurLat : uHomeLat;
    const uPickLon = useCur && uCurLon != null ? uCurLon : uHomeLon;
    const distRU = (rLat != null && rLon != null && uPickLat != null && uPickLon != null) ? haversineKm(rLat, rLon, uPickLat, uPickLon) : null;
    const distUE = (uPickLat != null && uPickLon != null && eLat != null && eLon != null) ? haversineKm(uPickLat, uPickLon, eLat, eLon) : null;
    res.json({
        solicitud_id: sid,
        usuario: { lat: uPickLat, lon: uPickLon },
        usuario_actual: { lat: uCurLat, lon: uCurLon },
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
    const snapLat2 = s?.recolector_accept_lat;
    const snapLon2 = s?.recolector_accept_lon;
    let recolector = null;
    if (snapLat2 != null && snapLon2 != null) {
        recolector = { lat: Number(snapLat2), lon: Number(snapLon2) };
    }
    else {
        const recoRow = await pool_1.pool.query("SELECT lat, lon FROM recolectores WHERE id=$1", [Number(s.recolector_id)]);
        recolector = recoRow.rows[0] || null;
    }
    const uHomeLat2 = (usuario && usuario.home_lat !== undefined && usuario.home_lat !== null)
        ? Number(usuario.home_lat)
        : (usuario && usuario.lat !== undefined && usuario.lat !== null ? Number(usuario.lat) : NaN);
    const uHomeLon2 = (usuario && usuario.home_lon !== undefined && usuario.home_lon !== null)
        ? Number(usuario.home_lon)
        : (usuario && usuario.lon !== undefined && usuario.lon !== null ? Number(usuario.lon) : NaN);
    const uCurLat2 = (usuario && usuario.current_lat !== undefined && usuario.current_lat !== null)
        ? Number(usuario.current_lat)
        : NaN;
    const uCurLon2 = (usuario && usuario.current_lon !== undefined && usuario.current_lon !== null)
        ? Number(usuario.current_lon)
        : NaN;
    const eLat = empresa?.lat !== null && empresa?.lat !== undefined ? Number(empresa.lat) : NaN;
    const eLon = empresa?.lon !== null && empresa?.lon !== undefined ? Number(empresa.lon) : NaN;
    const rLat = recolector?.lat !== null && recolector?.lat !== undefined ? Number(recolector.lat) : NaN;
    const rLon = recolector?.lon !== null && recolector?.lon !== undefined ? Number(recolector.lon) : NaN;
    const useCur2 = Boolean(s?.usuario_pick_actual);
    const uPickLat2 = useCur2 && !isNaN(uCurLat2) ? uCurLat2 : uHomeLat2;
    const uPickLon2 = useCur2 && !isNaN(uCurLon2) ? uCurLon2 : uHomeLon2;
    const distRU = (!isNaN(rLat) && !isNaN(rLon) && !isNaN(uPickLat2) && !isNaN(uPickLon2)) ? haversineKm(rLat, rLon, uPickLat2, uPickLon2) : null;
    const distUE = (!isNaN(uPickLat2) && !isNaN(uPickLon2) && !isNaN(eLat) && !isNaN(eLon)) ? haversineKm(uPickLat2, uPickLon2, eLat, eLon) : null;
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
exports.recolectorRouter.get("/vehiculos_tipos", (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
    const r = await pool_1.pool.query("SELECT id, nombre FROM vehiculo_tipos WHERE activo=true ORDER BY nombre");
    res.json(r.rows);
}));
