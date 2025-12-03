"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ARRIVE_EMP_KM = exports.NEAR_EMP_KM = exports.AT_USER_KM = exports.NEAR_USER_KM = void 0;
exports.haversineKm = haversineKm;
exports.updateDeliveryProximityAndState = updateDeliveryProximityAndState;
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
exports.NEAR_USER_KM = 0.8;
exports.AT_USER_KM = 0.1;
exports.NEAR_EMP_KM = 0.8;
exports.ARRIVE_EMP_KM = 0.1;
async function updateDeliveryProximityAndState(sid, lat, lon) {
    await pool_1.pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS handoff_state TEXT");
    const sRes = await pool_1.pool.query("SELECT id, usuario_id, empresa_id, recolector_id, usuario_pick_actual, estado, handoff_state FROM solicitudes WHERE id=$1", [sid]);
    const s = sRes.rows[0] || null;
    if (!s)
        return { dUserKm: null, dEmpKm: null, pauseAtUser: false, pauseAtHandoff: false };
    const uRes = await pool_1.pool.query("SELECT home_lat, home_lon, current_lat, current_lon FROM usuarios WHERE id=$1", [Number(s.usuario_id)]);
    const usuario = uRes.rows[0] || null;
    const eRes = await pool_1.pool.query("SELECT lat, lon FROM empresas WHERE id=$1", [Number(s.empresa_id)]);
    const empresa = eRes.rows[0] || null;
    const useCur = Boolean(s.usuario_pick_actual);
    const uLat = useCur && usuario?.current_lat != null ? Number(usuario.current_lat) : (usuario?.home_lat != null ? Number(usuario.home_lat) : null);
    const uLon = useCur && usuario?.current_lon != null ? Number(usuario.current_lon) : (usuario?.home_lon != null ? Number(usuario.home_lon) : null);
    const eLat = empresa?.lat != null ? Number(empresa.lat) : null;
    const eLon = empresa?.lon != null ? Number(empresa.lon) : null;
    const dUserKm = (lat != null && lon != null && uLat != null && uLon != null) ? haversineKm(Number(lat), Number(lon), uLat, uLon) : null;
    const dEmpKm = (lat != null && lon != null && eLat != null && eLon != null) ? haversineKm(Number(lat), Number(lon), eLat, eLon) : null;
    const subs = global.__notifSubs || (global.__notifSubs = {});
    const send = async (role, destId, tipo, mensaje) => {
        const safeId = (destId != null && !Number.isNaN(destId) && destId > 0) ? destId : null;
        if (!safeId)
            return;
        const payload = `event: notif\ndata: ${JSON.stringify({ solicitud_id: Number(s.id), actor_destino: role, destino_id: Number(destId), tipo, mensaje })}\n\n`;
        try {
            await pool_1.pool.query("INSERT INTO notificaciones(solicitud_id, actor_destino, destino_id, tipo, mensaje) VALUES($1,$2,$3,$4,$5)", [Number(s.id), role, safeId, tipo, mensaje]);
        }
        catch { }
        const k = `${role}:${destId}`;
        const arr = subs[k] || [];
        for (const rr of arr) {
            try {
                rr.write(payload);
            }
            catch { }
        }
    };
    if (dUserKm != null && dUserKm <= exports.NEAR_USER_KM) {
        const exists = await pool_1.pool.query("SELECT 1 FROM notificaciones WHERE solicitud_id=$1 AND tipo IN ('cerca_usuario','cerca_recolector') LIMIT 1", [Number(s.id)]);
        if (!exists.rows[0]) {
            await send('recolector', Number(s.recolector_id || 0), 'cerca_usuario', 'Estás a 0.8 km de la casa del usuario');
            await send('usuario', Number(s.usuario_id || 0), 'cerca_recolector', 'Recolector está a 0.8 km de tu ubicación');
            const existsAsk = await pool_1.pool.query("SELECT 1 FROM notificaciones WHERE solicitud_id=$1 AND tipo='solicitar_confirmaciones' LIMIT 1", [Number(s.id)]);
            if (!existsAsk.rows[0]) {
                await send('usuario', Number(s.usuario_id || 0), 'solicitar_confirmaciones', 'Confirma llegada del recolector');
                await send('recolector', Number(s.recolector_id || 0), 'solicitar_confirmaciones', 'Confirma que ya recogiste del usuario');
            }
            await pool_1.pool.query("UPDATE solicitudes SET estado='cerca_usuario' WHERE id=$1", [Number(s.id)]);
        }
    }
    const canEmpresa = String(s.estado || '') === 'rumbo_a_empresa' || true;
    if (canEmpresa && dEmpKm != null && dEmpKm <= exports.NEAR_EMP_KM) {
        const exists2 = await pool_1.pool.query("SELECT 1 FROM notificaciones WHERE solicitud_id=$1 AND tipo='cerca_empresa' LIMIT 1", [Number(s.id)]);
        if (!exists2.rows[0]) {
            if (s.empresa_id)
                await send('empresa', Number(s.empresa_id), 'cerca_empresa', 'Recolector está a 0.8 km de tu local');
            await send('recolector', Number(s.recolector_id || 0), 'cerca_empresa', 'Estás a 0.8 km de tu destino');
            await pool_1.pool.query("UPDATE solicitudes SET estado='cerca_empresa' WHERE id=$1", [Number(s.id)]);
        }
    }
    if (dEmpKm != null && dEmpKm <= exports.ARRIVE_EMP_KM) {
        const exists3 = await pool_1.pool.query("SELECT 1 FROM notificaciones WHERE solicitud_id=$1 AND tipo='llego_empresa' LIMIT 1", [Number(s.id)]);
        if (!exists3.rows[0]) {
            if (s.empresa_id)
                await send('empresa', Number(s.empresa_id), 'llego_empresa', 'Recolector llegó a tu local');
            await send('recolector', Number(s.recolector_id || 0), 'llego_empresa', 'Has llegado a la empresa');
        }
        await pool_1.pool.query("UPDATE solicitudes SET estado='llego_empresa' WHERE id=$1", [Number(s.id)]);
    }
    const flagsQ = await pool_1.pool.query("SELECT usuario_llegada_ok, recolector_recojo_ok FROM solicitudes WHERE id=$1", [sid]);
    const flags = flagsQ.rows[0] || { usuario_llegada_ok: false, recolector_recojo_ok: false };
    const atUsuario = (dUserKm != null) ? (dUserKm <= exports.AT_USER_KM) : false;
    const isCercaUsuario = String(s?.estado || '') === 'cerca_usuario';
    const bothOk = Boolean(flags.usuario_llegada_ok) && Boolean(flags.recolector_recojo_ok);
    const pauseAtUser = isCercaUsuario && !bothOk && atUsuario;
    const hs = String(s?.handoff_state || '');
    const pauseAtHandoff = (hs === 'en_intercambio' || hs === 'publicado');
    return { dUserKm, dEmpKm, pauseAtUser, pauseAtHandoff };
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
        await pool_1.pool.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS delivery_cooldown_until TIMESTAMPTZ");
        const cd = await pool_1.pool.query("SELECT delivery_cooldown_until FROM usuarios WHERE id=$1", [usuarioId]);
        const until = cd.rows[0]?.delivery_cooldown_until ? new Date(cd.rows[0].delivery_cooldown_until) : null;
        if (until && until.getTime() > Date.now()) {
            const err = new Error("delivery_cooldown");
            err.retry_after_sec = Math.ceil((until.getTime() - Date.now()) / 1000);
            throw err;
        }
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
        await pool_1.pool.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS delivery_cooldown_until TIMESTAMPTZ");
        const estado = String(solicitud.estado || '');
        const pub = String(solicitud.estado_publicacion || '');
        if (estado === 'pendiente_delivery' && pub === 'publicada') {
            const s = await (0, solicitudesRepo_1.cancelarPublicacionSolicitud)(solicitudId);
            await pool_1.pool.query("UPDATE usuarios SET delivery_cooldown_until = NOW() + INTERVAL '1 minute' WHERE id=$1", [usuarioId]);
            return s;
        }
        if (estado === 'rumbo_usuario' || estado === 'cerca_usuario') {
            const s = await (0, solicitudesRepo_1.cancelarPublicacionSolicitud)(solicitudId);
            await pool_1.pool.query("UPDATE usuarios SET delivery_cooldown_until = NOW() + INTERVAL '1 minute' WHERE id=$1", [usuarioId]);
            return s;
        }
        throw new Error("Solicitud no cancelable");
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
