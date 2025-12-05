"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listarEmpresas = listarEmpresas;
exports.obtenerEmpresa = obtenerEmpresa;
exports.materialesDeEmpresa = materialesDeEmpresa;
exports.actualizarReputacionEmpresa = actualizarReputacionEmpresa;
exports.crearEmpresa = crearEmpresa;
exports.actualizarUbicacionEmpresaPorRuc = actualizarUbicacionEmpresaPorRuc;
exports.statsEmpresasTransacciones = statsEmpresasTransacciones;
exports.statsDistritosTransacciones = statsDistritosTransacciones;
const pool_1 = require("../db/pool");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
async function listarEmpresas() {
    const empresas = await pool_1.pool.query("SELECT e.*, COALESCE(cm.materiales, '[]') AS materiales FROM empresas e LEFT JOIN (SELECT empresa_id, JSON_AGG(JSON_BUILD_OBJECT('material_id', material_id, 'precio_por_kg', precio_por_kg)) AS materiales FROM empresa_materiales_precio GROUP BY empresa_id) cm ON cm.empresa_id = e.id WHERE e.estado=true ORDER BY e.id");
    return empresas.rows;
}
async function obtenerEmpresa(id) {
    const res = await pool_1.pool.query("SELECT * FROM empresas WHERE id=$1", [id]);
    return res.rows[0] || null;
}
async function materialesDeEmpresa(id) {
    const res = await pool_1.pool.query("SELECT emp.material_id, m.nombre, emp.precio_por_kg, emp.condiciones FROM empresa_materiales_precio emp JOIN materiales m ON m.id=emp.material_id WHERE emp.empresa_id=$1 ORDER BY m.nombre", [id]);
    return res.rows;
}
async function actualizarReputacionEmpresa(empresaId, puntaje) {
    const res = await pool_1.pool.query("UPDATE empresas SET reputacion_promedio = ((reputacion_promedio * resenas_recibidas_count) + $1) / (resenas_recibidas_count + 1), resenas_recibidas_count = resenas_recibidas_count + 1 WHERE id=$2 RETURNING *", [puntaje, empresaId]);
    return res.rows[0];
}
async function crearEmpresa(ruc, nombre, logo, lat, lon) {
    const res = await pool_1.pool.query("INSERT INTO empresas(ruc, nombre, logo, lat, lon) VALUES($1,$2,$3,$4,$5) RETURNING *", [ruc, nombre, logo, lat, lon]);
    return res.rows[0];
}
async function actualizarUbicacionEmpresaPorRuc(ruc, lat, lon) {
    const res = await pool_1.pool.query("UPDATE empresas SET lat=$2, lon=$3 WHERE ruc=$1 RETURNING *", [ruc, lat, lon]);
    return res.rows[0] || null;
}
async function statsEmpresasTransacciones() {
    const res = await pool_1.pool.query("SELECT empresa_id AS id, COUNT(*)::int AS transacciones_count, COALESCE(SUM(monto_pagado),0)::float AS monto_total FROM transacciones GROUP BY empresa_id ORDER BY transacciones_count DESC");
    return res.rows;
}
function puntoEnAnillo(lat, lon, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][1], yi = ring[i][0];
        const xj = ring[j][1], yj = ring[j][0];
        const intersect = ((yi > lon) !== (yj > lon)) && (lat < (xj - xi) * (lon - yi) / ((yj - yi) + 1e-12) + xi);
        if (intersect)
            inside = !inside;
    }
    return inside;
}
function contieneFeature(feature, lat, lon) {
    const g = feature && feature.geometry;
    if (!g)
        return false;
    if (g.type === "Polygon") {
        const rings = g.coordinates || [];
        return puntoEnAnillo(lat, lon, rings[0] || []);
    }
    if (g.type === "MultiPolygon") {
        const polys = g.coordinates || [];
        for (const p of polys) {
            if (puntoEnAnillo(lat, lon, (p[0] || [])))
                return true;
        }
        return false;
    }
    return false;
}
async function statsDistritosTransacciones() {
    const empRes = await pool_1.pool.query("SELECT id, lat, lon FROM empresas");
    const txRes = await pool_1.pool.query("SELECT empresa_id, COUNT(*)::int AS c FROM transacciones GROUP BY empresa_id");
    const countByEmpresa = new Map();
    for (const r of txRes.rows)
        countByEmpresa.set(Number(r.empresa_id), Number(r.c));
    const geoPath = path_1.default.resolve("public", "data", "lima_callao_distritos.geojson");
    const raw = fs_1.default.readFileSync(geoPath, "utf-8");
    const geo = JSON.parse(raw);
    const feats = Array.isArray(geo?.features) ? geo.features : [];
    const byDist = new Map();
    for (const e of empRes.rows) {
        const lat = parseFloat(String(e.lat));
        const lon = parseFloat(String(e.lon));
        if (isNaN(lat) || isNaN(lon))
            continue;
        let name = null;
        for (const f of feats) {
            if (contieneFeature(f, lat, lon)) {
                const p = f.properties || {};
                name = String(p.nombre || p.name || p.NOMBREDIST || p.distrito || "");
                break;
            }
        }
        if (!name)
            continue;
        const cur = byDist.get(name) || 0;
        byDist.set(name, cur + (countByEmpresa.get(Number(e.id)) || 0));
    }
    const rows = Array.from(byDist.entries()).map(([d, c]) => ({ distrito: d, transacciones_count: c }))
        .sort((a, b) => b.transacciones_count - a.transacciones_count);
    return rows;
}
