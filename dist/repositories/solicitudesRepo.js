"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crearSolicitud = crearSolicitud;
exports.crearSolicitudDelivery = crearSolicitudDelivery;
exports.obtenerSolicitud = obtenerSolicitud;
exports.solicitudesPendientesEmpresa = solicitudesPendientesEmpresa;
exports.actualizarEstadoSolicitud = actualizarEstadoSolicitud;
exports.cancelarPublicacionSolicitud = cancelarPublicacionSolicitud;
exports.aceptarPorRecolector = aceptarPorRecolector;
exports.actualizarEstadoOperativo = actualizarEstadoOperativo;
exports.listarSolicitudesPublicadas = listarSolicitudesPublicadas;
exports.marcarSolicitudesExpiradas = marcarSolicitudesExpiradas;
exports.republicarSolicitudExpirada = republicarSolicitudExpirada;
exports.guardarItemsSolicitudJSON = guardarItemsSolicitudJSON;
exports.historialRecolector = historialRecolector;
const pool_1 = require("../db/pool");
async function crearSolicitud(usuarioId, empresaId) {
    const res = await pool_1.pool.query("INSERT INTO solicitudes(usuario_id, empresa_id, estado) VALUES($1, $2, 'pendiente_empresa') RETURNING *", [usuarioId, empresaId]);
    return res.rows[0];
}
async function crearSolicitudDelivery(usuarioId, empresaId, deliveryFee, clasificacion, consent, termsVersion, useCurrent) {
    await pool_1.pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS publicacion_expira_en timestamp");
    await pool_1.pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS usuario_pick_actual boolean DEFAULT false");
    const res = await pool_1.pool.query("INSERT INTO solicitudes(usuario_id, empresa_id, estado, tipo_entrega, estado_publicacion, delivery_fee, clasificacion_distancia, delivery_consent, delivery_terms_version, usuario_pick_actual, publicacion_expira_en) VALUES($1,$2,'pendiente_delivery','delivery','publicada',$3,$4,$5,$6,$7, NOW() + INTERVAL '30 minutes') RETURNING *", [usuarioId, empresaId, deliveryFee, clasificacion, consent, termsVersion, Boolean(useCurrent)]);
    return res.rows[0];
}
async function obtenerSolicitud(id) {
    const res = await pool_1.pool.query("SELECT * FROM solicitudes WHERE id=$1", [id]);
    return res.rows[0] || null;
}
async function solicitudesPendientesEmpresa(empresaId) {
    await pool_1.pool.query("UPDATE solicitudes SET estado='expirada', estado_publicacion='expirada' WHERE tipo_entrega='delivery' AND estado='pendiente_delivery' AND estado_publicacion='publicada' AND publicacion_expira_en IS NOT NULL AND publicacion_expira_en <= NOW()");
    const res = await pool_1.pool.query("SELECT * FROM solicitudes WHERE empresa_id=$1 AND ( (tipo_entrega IS DISTINCT FROM 'delivery' AND estado='pendiente_empresa') OR (tipo_entrega='delivery' AND estado IN ('llego_empresa','entregado_empresa') AND estado NOT IN ('empresa_confirmo_recepcion','completada','rechazada','cancelada','expirada')) ) ORDER BY creado_en DESC", [empresaId]);
    return res.rows;
}
async function actualizarEstadoSolicitud(id, estado) {
    const res = await pool_1.pool.query("UPDATE solicitudes SET estado=$2 WHERE id=$1 RETURNING *", [id, estado]);
    return res.rows[0];
}
async function cancelarPublicacionSolicitud(id) {
    const res = await pool_1.pool.query("UPDATE solicitudes SET estado='cancelada', estado_publicacion='cancelada' WHERE id=$1 RETURNING *", [id]);
    return res.rows[0] || null;
}
async function aceptarPorRecolector(id, recolectorId, vehiculoId, lat, lon) {
    await pool_1.pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS recolector_accept_lat NUMERIC(9,6)");
    await pool_1.pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS recolector_accept_lon NUMERIC(9,6)");
    await pool_1.pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS vehiculo_id INTEGER");
    const busy = await pool_1.pool.query("SELECT 1 FROM solicitudes WHERE recolector_id=$1 AND tipo_entrega='delivery' AND estado_publicacion='aceptada_recolector' AND (estado IS DISTINCT FROM 'completada') LIMIT 1", [recolectorId]);
    if (busy.rows[0]) {
        throw Object.assign(new Error("recolector_ocupado"), { code: 422 });
    }
    const sRow = await pool_1.pool.query("SELECT tipo_entrega, items_json FROM solicitudes WHERE id=$1", [id]);
    const tipoEntrega = String(sRow.rows[0]?.tipo_entrega || '');
    const itemsRaw = sRow.rows[0]?.items_json || null;
    let kgTotal = 0;
    if (itemsRaw) {
        try {
            const arr = Array.isArray(itemsRaw) ? itemsRaw : JSON.parse(itemsRaw);
            kgTotal = arr.reduce((acc, it) => acc + Number(it.kg || 0), 0);
        }
        catch { }
    }
    let snapLat = lat != null ? Number(lat) : null;
    let snapLon = lon != null ? Number(lon) : null;
    if (snapLat == null || snapLon == null) {
        const r = await pool_1.pool.query("SELECT lat, lon FROM recolectores WHERE id=$1", [recolectorId]);
        snapLat = r.rows[0]?.lat != null ? Number(r.rows[0].lat) : snapLat;
        snapLon = r.rows[0]?.lon != null ? Number(r.rows[0].lon) : snapLon;
    }
    let vehId = vehiculoId != null ? Number(vehiculoId) : null;
    if (tipoEntrega === 'delivery') {
        if (vehId == null || isNaN(vehId)) {
            throw Object.assign(new Error("vehiculo_obligatorio"), { code: 422 });
        }
        const vRes = await pool_1.pool.query("SELECT id, capacidad_kg FROM vehiculos WHERE id=$1 AND recolector_id=$2 AND activo=true", [vehId, recolectorId]);
        const v = vRes.rows[0];
        if (!v) {
            throw Object.assign(new Error("vehiculo_invalido"), { code: 422 });
        }
        const capacidad = Number(v.capacidad_kg || 0);
        if (kgTotal > 0 && capacidad > 0 && kgTotal > capacidad) {
            throw Object.assign(new Error("capacidad_insuficiente"), { code: 422 });
        }
    }
    else if (vehId != null && !isNaN(vehId)) {
        const vRes = await pool_1.pool.query("SELECT id, capacidad_kg FROM vehiculos WHERE id=$1 AND recolector_id=$2 AND activo=true", [vehId, recolectorId]);
        const v = vRes.rows[0];
        if (!v) {
            throw Object.assign(new Error("vehiculo_invalido"), { code: 422 });
        }
        const capacidad = Number(v.capacidad_kg || 0);
        if (kgTotal > 0 && capacidad > 0 && kgTotal > capacidad) {
            throw Object.assign(new Error("capacidad_insuficiente"), { code: 422 });
        }
    }
    else {
        vehId = null;
    }
    const res = await pool_1.pool.query("UPDATE solicitudes SET estado_publicacion='aceptada_recolector', recolector_id=$2, vehiculo_id=$5, estado='rumbo_usuario', recolector_accept_lat=$3, recolector_accept_lon=$4 WHERE id=$1 AND estado_publicacion='publicada' RETURNING *", [id, recolectorId, snapLat, snapLon, vehId]);
    return res.rows[0] || null;
}
async function actualizarEstadoOperativo(id, estado) {
    const res = await pool_1.pool.query("UPDATE solicitudes SET estado_operativo=$2 WHERE id=$1 RETURNING *", [id, estado]);
    return res.rows[0];
}
async function listarSolicitudesPublicadas() {
    await pool_1.pool.query("UPDATE solicitudes SET estado='expirada', estado_publicacion='expirada' WHERE tipo_entrega='delivery' AND estado='pendiente_delivery' AND estado_publicacion='publicada' AND publicacion_expira_en IS NOT NULL AND publicacion_expira_en <= NOW()");
    const res = await pool_1.pool.query("SELECT * FROM solicitudes WHERE tipo_entrega='delivery' AND estado='pendiente_delivery' AND estado_publicacion='publicada' AND (publicacion_expira_en IS NULL OR publicacion_expira_en > NOW()) ORDER BY creado_en DESC");
    return res.rows;
}
async function marcarSolicitudesExpiradas() {
    const res = await pool_1.pool.query("UPDATE solicitudes SET estado='expirada', estado_publicacion='expirada' WHERE tipo_entrega='delivery' AND estado='pendiente_delivery' AND estado_publicacion='publicada' AND publicacion_expira_en IS NOT NULL AND publicacion_expira_en <= NOW() RETURNING *");
    return res.rows;
}
async function republicarSolicitudExpirada(id) {
    const res = await pool_1.pool.query("UPDATE solicitudes SET estado='pendiente_delivery', estado_publicacion='publicada', publicacion_expira_en=NOW() + INTERVAL '30 minutes' WHERE id=$1 AND tipo_entrega='delivery' AND estado='expirada' RETURNING *", [id]);
    return res.rows[0] || null;
}
async function guardarItemsSolicitudJSON(id, items) {
    await pool_1.pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS items_json jsonb");
    const res = await pool_1.pool.query("UPDATE solicitudes SET items_json=$2 WHERE id=$1 RETURNING *", [id, JSON.stringify(items)]);
    return res.rows[0];
}
async function historialRecolector(recolectorId) {
    const res = await pool_1.pool.query("SELECT s.id, s.usuario_id, u.email AS usuario_email, s.empresa_id, e.nombre AS empresa_nombre, s.delivery_fee, s.clasificacion_distancia, s.creado_en, s.estado, s.recolector_id, s.pickup_recolector_id, s.handoff_recolector_id FROM solicitudes s JOIN usuarios u ON u.id=s.usuario_id JOIN empresas e ON e.id=s.empresa_id WHERE (s.recolector_id=$1 OR s.pickup_recolector_id=$1) AND s.tipo_entrega='delivery' AND s.estado='completada' ORDER BY s.creado_en DESC", [recolectorId]);
    return res.rows;
}
