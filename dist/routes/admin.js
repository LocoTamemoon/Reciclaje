"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRouter = void 0;
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const pool_1 = require("../db/pool");
const asyncHandler_1 = require("../middleware/asyncHandler");
exports.adminRouter = (0, express_1.Router)();
function requireAdmin(req, res, next) {
    try {
        const auth = String(req.headers.authorization || '');
        const m = auth.match(/^Bearer\s+(.+)$/i);
        if (!m) {
            res.status(401).json({ error: "no_auth" });
            return;
        }
        const secret = process.env.JWT_SECRET || "devsecret";
        const payload = jsonwebtoken_1.default.verify(m[1], secret);
        if (String(payload?.tipo) !== 'admin' || !payload?.id) {
            res.status(403).json({ error: "forbidden" });
            return;
        }
        req.adminId = Number(payload.id);
        next();
    }
    catch {
        res.status(401).json({ error: "invalid_token" });
    }
}
exports.adminRouter.get("/me", requireAdmin, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.adminId);
    const r = await pool_1.pool.query("SELECT id, email, nombre, apellidos, foto_perfil, estado, creado_en FROM admins WHERE id=$1", [id]);
    res.json(r.rows[0] || null);
}));
exports.adminRouter.get("/usuarios", requireAdmin, (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
    const r = await pool_1.pool.query("SELECT id, email, nombre, apellidos, dni, estado, puntos_acumulados, solicitudes_count, kg_totales, creado_en FROM usuarios ORDER BY creado_en DESC LIMIT 200");
    res.json(r.rows);
}));
exports.adminRouter.patch("/usuarios/:id/estado", requireAdmin, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const estado = Boolean(req.body?.estado);
    if (!id || Number.isNaN(id)) {
        res.status(400).json({ error: "invalid_id" });
        return;
    }
    const r = await pool_1.pool.query("UPDATE usuarios SET estado=$2 WHERE id=$1 RETURNING id, estado", [id, estado]);
    if (!r.rows[0]) {
        res.status(404).json({ error: "not_found" });
        return;
    }
    res.json(r.rows[0]);
}));
exports.adminRouter.get("/recolectores", requireAdmin, (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
    const sql = `
    SELECT r.id, r.email, r.nombre, r.apellidos, r.dni, r.estado,
           r.reputacion_promedio, r.trabajos_completados, r.id_distrito,
           (
             SELECT v.placa FROM vehiculos v
             WHERE v.recolector_id = r.id AND v.activo = true
             ORDER BY v.creado_en DESC NULLS LAST
             LIMIT 1
           ) AS placa_actual,
           r.creado_en
    FROM recolectores r
    ORDER BY r.creado_en DESC
    LIMIT 200`;
    const r = await pool_1.pool.query(sql);
    res.json(r.rows);
}));
exports.adminRouter.patch("/recolectores/:id/estado", requireAdmin, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const estado = Boolean(req.body?.estado);
    if (!id || Number.isNaN(id)) {
        res.status(400).json({ error: "invalid_id" });
        return;
    }
    const r = await pool_1.pool.query("UPDATE recolectores SET estado=$2 WHERE id=$1 RETURNING id, estado", [id, estado]);
    if (!r.rows[0]) {
        res.status(404).json({ error: "not_found" });
        return;
    }
    res.json(r.rows[0]);
}));
exports.adminRouter.get("/empresas", requireAdmin, (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
    const r = await pool_1.pool.query("SELECT id, nombre, email, ruc, estado, reputacion_promedio, resenas_recibidas_count, lat, lon, creado_en FROM empresas ORDER BY creado_en DESC LIMIT 200");
    res.json(r.rows);
}));
exports.adminRouter.patch("/empresas/:id/estado", requireAdmin, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const estado = Boolean(req.body?.estado);
    if (!id || Number.isNaN(id)) {
        res.status(400).json({ error: "invalid_id" });
        return;
    }
    const r = await pool_1.pool.query("UPDATE empresas SET estado=$2 WHERE id=$1 RETURNING id, estado", [id, estado]);
    if (!r.rows[0]) {
        res.status(404).json({ error: "not_found" });
        return;
    }
    let canceladas = 0;
    if (!estado) {
        const rows = await pool_1.pool.query("UPDATE solicitudes SET estado='cancelada', estado_publicacion='cancelada' WHERE empresa_id=$1 AND estado NOT IN ('completada','rechazada','cancelada','expirada') RETURNING id, usuario_id, recolector_id, pickup_recolector_id, tipo_entrega", [id]);
        canceladas = rows.rowCount || 0;
        const subs = global.__notifSubs || (global.__notifSubs = {});
        const notify = async (sid, destRole, destId, tipo, mensaje) => {
            const safeId = (destId != null && !Number.isNaN(destId) && destId > 0) ? destId : null;
            if (!safeId)
                return;
            const payload = `event: notif\ndata: ${JSON.stringify({ solicitud_id: Number(sid), actor_destino: destRole, destino_id: Number(destId), tipo, mensaje })}\n\n`;
            try {
                await pool_1.pool.query("INSERT INTO notificaciones(solicitud_id, actor_destino, destino_id, tipo, mensaje) VALUES($1,$2,$3,$4,$5)", [Number(sid), destRole, safeId, tipo, mensaje]);
            }
            catch { }
            const k = `${destRole}:${destId}`;
            const arr = subs[k] || [];
            for (const rr of arr) {
                try {
                    rr.write(payload);
                }
                catch { }
            }
        };
        for (const s of rows.rows) {
            const uid = Number(s.usuario_id || 0);
            if (uid > 0) {
                await notify(Number(s.id), 'usuario', uid, 'cancelada_por_empresa', 'Tu solicitud fue cancelada porque la empresa fue desactivada');
            }
            const rid1 = Number(s.recolector_id || 0);
            const rid2 = Number(s.pickup_recolector_id || 0);
            const ids = [];
            if (rid1 > 0)
                ids.push(rid1);
            if (rid2 > 0 && rid2 !== rid1)
                ids.push(rid2);
            for (const rid of ids) {
                await notify(Number(s.id), 'recolector', rid, 'cancelada_por_empresa', 'La solicitud que tenías asignada fue cancelada porque la empresa fue desactivada');
            }
        }
    }
    res.json({ ...r.rows[0], canceladas });
}));
exports.adminRouter.get("/resenas", requireAdmin, (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
    const sql = `
    SELECT 'empresa' AS tipo, re.id, re.puntaje, re.mensaje, re.creado_en, re.transaccion_id,
           re.empresa_id AS target_id, COALESCE(e.nombre, 'Empresa ' || e.id) AS target_nombre,
           'usuario' AS autor_rol,
           COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.nombre,''),' ',COALESCE(u.apellidos,''))),''), u.email, 'Usuario ' || u.id) AS autor_nombre,
           re.estado
    FROM resenas_empresas re
    JOIN empresas e ON e.id = re.empresa_id
    JOIN usuarios u ON u.id = re.usuario_id
    UNION ALL
    SELECT 'empresa_por_recolector' AS tipo, rr.id, rr.puntaje, rr.mensaje, rr.creado_en, rr.transaccion_id,
           rr.empresa_id AS target_id, COALESCE(e.nombre, 'Empresa ' || e.id) AS target_nombre,
           'recolector' AS autor_rol,
           COALESCE(NULLIF(TRIM(CONCAT(COALESCE(r.nombre,''),' ',COALESCE(r.apellidos,''))),''), r.email, 'Recolector ' || r.id) AS autor_nombre,
           rr.estado
    FROM resenas_empresas_por_recolector rr
    JOIN empresas e ON e.id = rr.empresa_id
    JOIN recolectores r ON r.id = rr.recolector_id
    UNION ALL
    SELECT 'usuario' AS tipo, ru.id, ru.puntaje, ru.mensaje, ru.creado_en, ru.transaccion_id,
           ru.usuario_id AS target_id, COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.nombre,''),' ',COALESCE(u.apellidos,''))),''), u.email, 'Usuario ' || u.id) AS target_nombre,
           'empresa' AS autor_rol,
           COALESCE(e.nombre, 'Empresa ' || e.id) AS autor_nombre,
           ru.estado
    FROM resenas_usuarios ru
    JOIN usuarios u ON u.id = ru.usuario_id
    JOIN empresas e ON e.id = ru.empresa_id
    UNION ALL
    SELECT 'usuario_por_recolector' AS tipo, ur.id, ur.puntaje, ur.mensaje, ur.creado_en, ur.transaccion_id,
           ur.usuario_id AS target_id, COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.nombre,''),' ',COALESCE(u.apellidos,''))),''), u.email, 'Usuario ' || u.id) AS target_nombre,
           'recolector' AS autor_rol,
           COALESCE(NULLIF(TRIM(CONCAT(COALESCE(r.nombre,''),' ',COALESCE(r.apellidos,''))),''), r.email, 'Recolector ' || r.id) AS autor_nombre,
           ur.estado
    FROM resenas_usuarios_por_recolector ur
    JOIN usuarios u ON u.id = ur.usuario_id
    JOIN recolectores r ON r.id = ur.recolector_id
    UNION ALL
    SELECT 'recolector' AS tipo, rr.id, rr.puntaje, rr.mensaje, rr.creado_en, rr.transaccion_id,
           rr.recolector_id AS target_id, COALESCE(NULLIF(TRIM(CONCAT(COALESCE(rc.nombre,''),' ',COALESCE(rc.apellidos,''))),''), rc.email, 'Recolector ' || rc.id) AS target_nombre,
           rr.evaluador_rol AS autor_rol,
            CASE WHEN rr.evaluador_rol='usuario'
                THEN COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.nombre,''),' ',COALESCE(u.apellidos,''))),''), u.email, 'Usuario ' || u.id)
                ELSE COALESCE(e.nombre, 'Empresa ' || e.id) END AS autor_nombre,
           rr.estado
    FROM resenas_recolectores rr
    LEFT JOIN recolectores rc ON rc.id = rr.recolector_id
    LEFT JOIN usuarios u ON u.id = rr.evaluador_id AND rr.evaluador_rol='usuario'
    LEFT JOIN empresas e ON e.id = rr.evaluador_id AND rr.evaluador_rol='empresa'
    ORDER BY creado_en DESC
    LIMIT 300`;
    const r = await pool_1.pool.query(sql);
    res.json(r.rows);
}));
exports.adminRouter.patch("/resenas/:tipo/:id/estado", requireAdmin, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const tipo = String(req.params.tipo);
    const id = Number(req.params.id);
    const estado = Boolean(req.body?.estado);
    if (!id || Number.isNaN(id)) {
        res.status(400).json({ error: "invalid_id" });
        return;
    }
    let sql = null;
    switch (tipo) {
        case 'empresa':
            sql = "UPDATE resenas_empresas SET estado=$2 WHERE id=$1 RETURNING id, estado";
            break;
        case 'empresa_por_recolector':
            sql = "UPDATE resenas_empresas_por_recolector SET estado=$2 WHERE id=$1 RETURNING id, estado";
            break;
        case 'usuario':
            sql = "UPDATE resenas_usuarios SET estado=$2 WHERE id=$1 RETURNING id, estado";
            break;
        case 'usuario_por_recolector':
            sql = "UPDATE resenas_usuarios_por_recolector SET estado=$2 WHERE id=$1 RETURNING id, estado";
            break;
        case 'recolector':
            sql = "UPDATE resenas_recolectores SET estado=$2 WHERE id=$1 RETURNING id, estado";
            break;
        default:
            res.status(400).json({ error: "tipo_invalido" });
            return;
    }
    const r = await pool_1.pool.query(sql, [id, estado]);
    if (!r.rows[0]) {
        res.status(404).json({ error: "not_found" });
        return;
    }
    res.json(r.rows[0]);
}));
exports.adminRouter.get("/solicitudes", requireAdmin, (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
    const r = await pool_1.pool.query("SELECT id, usuario_id, empresa_id, recolector_id, tipo_entrega, estado, estado_publicacion, creado_en FROM solicitudes ORDER BY creado_en DESC LIMIT 200");
    res.json(r.rows);
}));
exports.adminRouter.get("/transacciones", requireAdmin, (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
    const r = await pool_1.pool.query("SELECT id, solicitud_id, usuario_id, empresa_id, monto_pagado, metodo_pago, modo_entrega, puntos_obtenidos, fecha FROM transacciones ORDER BY fecha DESC LIMIT 200");
    res.json(r.rows);
}));
exports.adminRouter.get("/usuarios/:id/detalle", requireAdmin, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const u = await pool_1.pool.query("SELECT id, email, nombre, apellidos, dni, puntos_acumulados, solicitudes_count, kg_totales, creado_en FROM usuarios WHERE id=$1", [id]);
    const s = await pool_1.pool.query("SELECT id, empresa_id, tipo_entrega, estado, creado_en FROM solicitudes WHERE usuario_id=$1 ORDER BY creado_en DESC LIMIT 50", [id]);
    const t = await pool_1.pool.query("SELECT id, solicitud_id, monto_pagado, puntos_obtenidos, fecha FROM transacciones WHERE usuario_id=$1 ORDER BY fecha DESC LIMIT 50", [id]);
    res.json({ usuario: u.rows[0] || null, solicitudes: s.rows, transacciones: t.rows });
}));
exports.adminRouter.get("/recolectores/:id/detalle", requireAdmin, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const r = await pool_1.pool.query("SELECT id, email, nombre, apellidos, dni, estado, trabajos_completados, reputacion_promedio, id_distrito, creado_en FROM recolectores WHERE id=$1", [id]);
    const s = await pool_1.pool.query("SELECT id, usuario_id, empresa_id, tipo_entrega, estado, creado_en FROM solicitudes WHERE recolector_id=$1 OR pickup_recolector_id=$1 ORDER BY creado_en DESC LIMIT 50", [id]);
    res.json({ recolector: r.rows[0] || null, solicitudes: s.rows });
}));
exports.adminRouter.get("/empresas/:id/detalle", requireAdmin, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const e = await pool_1.pool.query("SELECT id, nombre, email, ruc, reputacion_promedio, resenas_recibidas_count, lat, lon, creado_en FROM empresas WHERE id=$1", [id]);
    const s = await pool_1.pool.query("SELECT id, usuario_id, tipo_entrega, estado, creado_en FROM solicitudes WHERE empresa_id=$1 ORDER BY creado_en DESC LIMIT 50", [id]);
    const t = await pool_1.pool.query("SELECT id, solicitud_id, usuario_id, monto_pagado, fecha FROM transacciones WHERE empresa_id=$1 ORDER BY fecha DESC LIMIT 50", [id]);
    res.json({ empresa: e.rows[0] || null, solicitudes: s.rows, transacciones: t.rows });
}));
