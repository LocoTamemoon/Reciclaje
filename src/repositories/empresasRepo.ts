import { pool } from "../db/pool";
import fs from "fs";
import path from "path";

export async function listarEmpresas() {
  const empresas = await pool.query(
    "SELECT e.*, COALESCE(cm.materiales, '[]') AS materiales FROM empresas e LEFT JOIN (SELECT empresa_id, JSON_AGG(JSON_BUILD_OBJECT('material_id', material_id, 'precio_por_kg', precio_por_kg)) AS materiales FROM empresa_materiales_precio GROUP BY empresa_id) cm ON cm.empresa_id = e.id ORDER BY e.id"
  );
  return empresas.rows;
}

export async function obtenerEmpresa(id: number) {
  const res = await pool.query("SELECT * FROM empresas WHERE id=$1", [id]);
  return res.rows[0] || null;
}

export async function materialesDeEmpresa(id: number) {
  const res = await pool.query(
    "SELECT emp.material_id, m.nombre, emp.precio_por_kg, emp.condiciones FROM empresa_materiales_precio emp JOIN materiales m ON m.id=emp.material_id WHERE emp.empresa_id=$1 ORDER BY m.nombre",
    [id]
  );
  return res.rows;
}

export async function actualizarReputacionEmpresa(empresaId: number, puntaje: number) {
  const res = await pool.query(
    "UPDATE empresas SET reputacion_promedio = ((reputacion_promedio * resenas_recibidas_count) + $1) / (resenas_recibidas_count + 1), resenas_recibidas_count = resenas_recibidas_count + 1 WHERE id=$2 RETURNING *",
    [puntaje, empresaId]
  );
  return res.rows[0];
}

export async function crearEmpresa(
  ruc: string,
  nombre: string,
  logo: string | null,
  lat: number | null,
  lon: number | null
) {
  const res = await pool.query(
    "INSERT INTO empresas(ruc, nombre, logo, lat, lon) VALUES($1,$2,$3,$4,$5) RETURNING *",
    [ruc, nombre, logo, lat, lon]
  );
  return res.rows[0];
}

export async function actualizarUbicacionEmpresaPorRuc(ruc: string, lat: number, lon: number) {
  const res = await pool.query(
    "UPDATE empresas SET lat=$2, lon=$3 WHERE ruc=$1 RETURNING *",
    [ruc, lat, lon]
  );
  return res.rows[0] || null;
}

export async function statsEmpresasTransacciones() {
  const res = await pool.query(
    "SELECT empresa_id AS id, COUNT(*)::int AS transacciones_count, COALESCE(SUM(monto_pagado),0)::float AS monto_total FROM transacciones GROUP BY empresa_id ORDER BY transacciones_count DESC"
  );
  return res.rows;
}

function puntoEnAnillo(lat: number, lon: number, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][1], yi = ring[i][0];
    const xj = ring[j][1], yj = ring[j][0];
    const intersect = ((yi > lon) !== (yj > lon)) && (lat < (xj - xi) * (lon - yi) / ((yj - yi) + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function contieneFeature(feature: any, lat: number, lon: number): boolean {
  const g = feature && feature.geometry;
  if (!g) return false;
  if (g.type === "Polygon") {
    const rings: number[][][] = g.coordinates || [];
    return puntoEnAnillo(lat, lon, rings[0] || []);
  }
  if (g.type === "MultiPolygon") {
    const polys: number[][][][] = g.coordinates || [];
    for (const p of polys) { if (puntoEnAnillo(lat, lon, (p[0] || []) as any)) return true; }
    return false;
  }
  return false;
}

export async function statsDistritosTransacciones() {
  const empRes = await pool.query("SELECT id, lat, lon FROM empresas");
  const txRes = await pool.query("SELECT empresa_id, COUNT(*)::int AS c FROM transacciones GROUP BY empresa_id");
  const countByEmpresa = new Map<number, number>();
  for (const r of txRes.rows) countByEmpresa.set(Number(r.empresa_id), Number(r.c));
  const geoPath = path.resolve("public", "data", "lima_callao_distritos.geojson");
  const raw = fs.readFileSync(geoPath, "utf-8");
  const geo = JSON.parse(raw);
  const feats = Array.isArray(geo?.features) ? geo.features : [];
  const byDist = new Map<string, number>();
  for (const e of empRes.rows) {
    const lat = parseFloat(String(e.lat));
    const lon = parseFloat(String(e.lon));
    if (isNaN(lat) || isNaN(lon)) continue;
    let name: string | null = null;
    for (const f of feats) {
      if (contieneFeature(f, lat, lon)) {
        const p = f.properties || {};
        name = String(p.nombre || p.name || p.NOMBREDIST || p.distrito || "");
        break;
      }
    }
    if (!name) continue;
    const cur = byDist.get(name) || 0;
    byDist.set(name, cur + (countByEmpresa.get(Number(e.id)) || 0));
  }
  const rows = Array.from(byDist.entries()).map(([d, c]) => ({ distrito: d, transacciones_count: c }))
    .sort((a, b) => b.transacciones_count - a.transacciones_count);
  return rows;
}
