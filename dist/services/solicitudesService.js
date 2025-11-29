"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crearNuevaSolicitud = crearNuevaSolicitud;
exports.aceptarSolicitud = aceptarSolicitud;
exports.rechazarSolicitud = rechazarSolicitud;
exports.cancelarSolicitudPorUsuario = cancelarSolicitudPorUsuario;
exports.republicarSolicitudPorUsuario = republicarSolicitudPorUsuario;
exports.recalcularClasificacionYFee = recalcularClasificacionYFee;
const empresasRepo_1 = require("../repositories/empresasRepo");
const solicitudesRepo_1 = require("../repositories/solicitudesRepo");
const usuariosRepo_1 = require("../repositories/usuariosRepo");
const usuariosRepo_2 = require("../repositories/usuariosRepo");
const pool_1 = require("../db/pool");
function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = (x) => (x * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
function clasificarDistanciaPorKm(km) {
    if (km <= 2)
        return "ideal";
    if (km <= 6)
        return "normal";
    return "larga";
}
function calcularFeePorBanda(banda, km) {
    let min = 0, max = 0, baseSpan = 0;
    if (banda === "ideal") {
        min = 3.5;
        max = 4.0;
        baseSpan = 2;
    }
    else if (banda === "normal") {
        min = 4.5;
        max = 6.0;
        baseSpan = 4;
    }
    else {
        min = 6.0;
        max = 8.0;
        baseSpan = 12;
    }
    let factor = 0;
    if (banda === "ideal")
        factor = Math.min(km / 2, 1);
    else if (banda === "normal")
        factor = Math.min((km - 2) / (6 - 2), 1);
    else
        factor = Math.min((km - 6) / baseSpan, 1);
    const bruto = min + (max - min) * Math.max(0, Math.min(1, factor));
    const rounded = Math.round(bruto * 10) / 10;
    return Math.min(rounded, max);
}
async function crearNuevaSolicitud(usuarioId, empresaId, items, delivery, consent, termsVersion, useCurrent) {
    const empresa = await (0, empresasRepo_1.obtenerEmpresa)(empresaId);
    if (!empresa)
        throw new Error("Empresa no encontrada");
    let solicitud;
    if (delivery) {
        const mats = await (0, empresasRepo_1.materialesDeEmpresa)(empresaId);
        const precioMap = new Map();
        for (const m of mats)
            precioMap.set(Number(m.material_id), Number(m.precio_por_kg));
        const itemsArr = Array.isArray(items) ? items : [];
        const totalEstimado = itemsArr.reduce((acc, it) => acc + (Number(it.kg || 0) * (precioMap.get(Number(it.material_id)) || 0)), 0);
        if (totalEstimado < 35) {
            const err = new Error("delivery_min_total");
            throw err;
        }
        const usuario = await (0, usuariosRepo_1.obtenerUsuario)(usuarioId);
        const homeLat = Number(usuario?.home_lat || 0);
        const homeLon = Number(usuario?.home_lon || 0);
        const curLat = Number(usuario?.current_lat || 0);
        const curLon = Number(usuario?.current_lon || 0);
        const pickLat = useCurrent && curLat ? curLat : homeLat;
        const pickLon = useCurrent && curLon ? curLon : homeLon;
        const eLat = Number(empresa?.lat || 0);
        const eLon = Number(empresa?.lon || 0);
        const km = (pickLat && pickLon && eLat && eLon) ? haversineKm(pickLat, pickLon, eLat, eLon) : 6.1;
        const banda = clasificarDistanciaPorKm(km);
        const fee = calcularFeePorBanda(banda, km);
        solicitud = await (0, solicitudesRepo_1.crearSolicitudDelivery)(usuarioId, empresaId, fee, banda, Boolean(consent), termsVersion || null, Boolean(useCurrent));
    }
    else {
        solicitud = await (0, solicitudesRepo_1.crearSolicitud)(usuarioId, empresaId);
    }
    await (0, usuariosRepo_2.incrementarSolicitudesUsuario)(usuarioId);
    if (items && items.length > 0)
        await (0, solicitudesRepo_1.guardarItemsSolicitudJSON)(Number(solicitud.id), items);
    return solicitud;
}
async function aceptarSolicitud(empresaId, solicitudId) {
    const solicitud = await (0, solicitudesRepo_1.obtenerSolicitud)(solicitudId);
    if (!solicitud || solicitud.empresa_id !== empresaId)
        throw new Error("Solicitud no válida");
    return await (0, solicitudesRepo_1.actualizarEstadoSolicitud)(solicitudId, "aceptada");
}
async function rechazarSolicitud(empresaId, solicitudId) {
    const solicitud = await (0, solicitudesRepo_1.obtenerSolicitud)(solicitudId);
    if (!solicitud || solicitud.empresa_id !== empresaId)
        throw new Error("Solicitud no válida");
    return await (0, solicitudesRepo_1.actualizarEstadoSolicitud)(solicitudId, "rechazada");
}
async function cancelarSolicitudPorUsuario(usuarioId, solicitudId) {
    const solicitud = await (0, solicitudesRepo_1.obtenerSolicitud)(solicitudId);
    if (!solicitud || solicitud.usuario_id !== usuarioId)
        throw new Error("Solicitud no válida");
    if (String(solicitud.tipo_entrega) === "delivery") {
        if (String(solicitud.estado) !== 'pendiente_delivery' || String(solicitud.estado_publicacion) !== 'publicada')
            throw new Error("Solicitud no cancelable");
        const s = await (0, solicitudesRepo_1.cancelarPublicacionSolicitud)(solicitudId);
        return s;
    }
    if (solicitud.estado !== "pendiente_empresa")
        throw new Error("Solicitud no cancelable");
    return await (0, solicitudesRepo_1.actualizarEstadoSolicitud)(solicitudId, "cancelada");
}
async function republicarSolicitudPorUsuario(usuarioId, solicitudId) {
    const solicitud = await (0, solicitudesRepo_1.obtenerSolicitud)(solicitudId);
    if (!solicitud || solicitud.usuario_id !== usuarioId)
        throw new Error("Solicitud no válida");
    if (String(solicitud.tipo_entrega) !== "delivery" || String(solicitud.estado) !== "expirada")
        throw new Error("Solicitud no republicable");
    const s = await (0, solicitudesRepo_1.republicarSolicitudExpirada)(solicitudId);
    return s;
}
async function recalcularClasificacionYFee(solicitudId) {
    const s = await (0, solicitudesRepo_1.obtenerSolicitud)(solicitudId);
    if (!s)
        return null;
    if (String(s.tipo_entrega) !== "delivery")
        return null;
    const usuario = await (0, usuariosRepo_1.obtenerUsuario)(Number(s.usuario_id));
    const empresa = await (0, empresasRepo_1.obtenerEmpresa)(Number(s.empresa_id));
    const eLat = empresa?.lat != null ? Number(empresa.lat) : NaN;
    const eLon = empresa?.lon != null ? Number(empresa.lon) : NaN;
    const useCur = Boolean(s.usuario_pick_actual);
    const uHomeLat = usuario?.home_lat != null ? Number(usuario.home_lat) : (usuario?.lat != null ? Number(usuario.lat) : NaN);
    const uHomeLon = usuario?.home_lon != null ? Number(usuario.home_lon) : (usuario?.lon != null ? Number(usuario.lon) : NaN);
    const uCurLat = usuario?.current_lat != null ? Number(usuario.current_lat) : NaN;
    const uCurLon = usuario?.current_lon != null ? Number(usuario.current_lon) : NaN;
    const uLat = useCur && !isNaN(uCurLat) && !isNaN(uCurLon) ? uCurLat : uHomeLat;
    const uLon = useCur && !isNaN(uCurLat) && !isNaN(uCurLon) ? uCurLon : uHomeLon;
    let rLat = s.recolector_accept_lat != null ? Number(s.recolector_accept_lat) : NaN;
    let rLon = s.recolector_accept_lon != null ? Number(s.recolector_accept_lon) : NaN;
    if (isNaN(rLat) || isNaN(rLon)) {
        try {
            const rRow = await pool_1.pool.query("SELECT lat, lon FROM recolectores WHERE id=$1", [Number(s.recolector_id)]);
            rLat = rRow.rows[0]?.lat != null ? Number(rRow.rows[0].lat) : rLat;
            rLon = rRow.rows[0]?.lon != null ? Number(rRow.rows[0].lon) : rLon;
        }
        catch { }
    }
    const kmRU = (!isNaN(rLat) && !isNaN(rLon) && !isNaN(uLat) && !isNaN(uLon)) ? haversineKm(rLat, rLon, uLat, uLon) : 0;
    const kmUE = (!isNaN(uLat) && !isNaN(uLon) && !isNaN(eLat) && !isNaN(eLon)) ? haversineKm(uLat, uLon, eLat, eLon) : 0;
    const kmTotal = kmRU + kmUE;
    const banda = clasificarDistanciaPorKm(kmTotal);
    const fee = calcularFeePorBanda(banda, kmTotal);
    await pool_1.pool.query("UPDATE solicitudes SET clasificacion_distancia=$2, delivery_fee=$3 WHERE id=$1", [solicitudId, banda, fee]);
    return { banda, fee, km_total: kmTotal };
}
