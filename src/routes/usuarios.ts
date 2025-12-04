import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { historialUsuario } from "../repositories/transaccionesRepo";
import { pool } from "../db/pool";
import { asyncHandler } from "../middleware/asyncHandler";
import { redimirPuntosUsuario } from "../repositories/usuariosRepo";
import { actualizarUbicacionActualUsuario } from "../repositories/usuariosRepo";

export const usuariosRouter = Router();

usuariosRouter.get("/:id/historial", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const data = await historialUsuario(id);
  res.json(data);
}));

usuariosRouter.get("/:id/dashboard", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const pendientes = await pool.query(
    "SELECT * FROM solicitudes WHERE usuario_id=$1 AND ( (tipo_entrega IS DISTINCT FROM 'delivery' AND estado='pendiente_empresa') OR (tipo_entrega='delivery' AND ( (estado='pendiente_delivery' AND estado_publicacion='publicada') OR (estado_publicacion='aceptada_recolector' AND estado IN ('rumbo_usuario','cerca_usuario','rumbo_a_empresa','cerca_empresa')) ) ) ) ORDER BY creado_en DESC",
    [id]
  );
  const anteriores = await pool.query(
    "SELECT * FROM solicitudes WHERE usuario_id=$1 AND NOT ( (tipo_entrega IS DISTINCT FROM 'delivery' AND estado='pendiente_empresa') OR (tipo_entrega='delivery' AND ( (estado='pendiente_delivery' AND estado_publicacion='publicada') OR (estado_publicacion='aceptada_recolector' AND estado IN ('rumbo_usuario','cerca_usuario','rumbo_a_empresa','cerca_empresa')) ) ) ) ORDER BY creado_en DESC",
    [id]
  );
  function etiquetaSolicitud(s: any): string | null {
    const tipo = String(s?.tipo_entrega || "");
    const estado = String(s?.estado || "");
    const handoffIdRaw = (s as any)?.handoff_recolector_id;
    const handoffId = handoffIdRaw != null ? Number(handoffIdRaw) : null;
    const huboHandoff = handoffId != null && !Number.isNaN(handoffId) && handoffId > 0;
    if (tipo === "delivery" && estado === "completada" && !huboHandoff) return "completada_delivery";
    if (tipo === "delivery" && estado === "completada" && huboHandoff) return "completada_delivery_handoff";
    if (tipo === "delivery" && estado === "completada_repesada" && huboHandoff) return "completada_repesada_delivery_handoff";
    return null;
  }
  const anterioresEtiquetadas = anteriores.rows.map((s: any) => ({ ...s, etiqueta: etiquetaSolicitud(s) }));
  const historial = await historialUsuario(id);
  res.json({ solicitudes_pendientes: pendientes.rows, solicitudes_anteriores: anterioresEtiquetadas, historial_transacciones: historial });
}));

usuariosRouter.get("/:id/stats", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const total = await pool.query(
    "SELECT COALESCE(SUM(monto_pagado),0) AS monto_total FROM transacciones WHERE usuario_id=$1",
    [id]
  );
  const row = total.rows[0] || { monto_total: 0 };
  res.json({ monto_total: Number(row.monto_total) });
}));

usuariosRouter.get("/:id/perfil", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const userRes = await pool.query(
    "SELECT id, nombre, apellidos, puntos_acumulados, kg_totales, reputacion_promedio, resenas_recibidas_count, foto_perfil_path FROM usuarios WHERE id=$1",
    [id]
  );
  const u = userRes.rows[0] || null;
  const matsRes = await pool.query(
    "SELECT umt.material_id, m.nombre, umt.kg_totales FROM usuario_materiales_totales umt JOIN materiales m ON m.id=umt.material_id WHERE umt.usuario_id=$1 ORDER BY m.nombre",
    [id]
  );
  const resenasRes = await pool.query(
    "SELECT ru.id, ru.puntaje, ru.mensaje, ru.creado_en, ru.transaccion_id, ru.empresa_id, COALESCE(e.nombre, 'Empresa ' || e.id) AS empresa_nombre FROM resenas_usuarios ru JOIN empresas e ON e.id=ru.empresa_id WHERE ru.usuario_id=$1 ORDER BY ru.creado_en DESC",
    [id]
  );
  res.json({ usuario: u, materiales: matsRes.rows, resenas: resenasRes.rows });
}));

usuariosRouter.patch("/:id/perfil", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const nombre = req.body?.nombre!=null ? String(req.body.nombre) : null;
  const apellidos = req.body?.apellidos!=null ? String(req.body.apellidos) : null;
  const fotoBase64 = req.body?.foto_base64!=null ? String(req.body.foto_base64) : null;
  let fotoPath: string | null = null;
  if (fotoBase64) {
    try {
      const dir = path.resolve("public", "img");
      try { fs.mkdirSync(dir, { recursive: true }); } catch {}
      const code = Date.now().toString(36);
      const filename = `${id}_usuario_${code}.png`;
      const full = path.join(dir, filename);
      const data = /^data:image\/(png|jpeg);base64,/i.test(fotoBase64) ? fotoBase64.replace(/^data:image\/(png|jpeg);base64,/i, "") : fotoBase64;
      const buf = Buffer.from(data, "base64");
      fs.writeFileSync(full, buf);
      fotoPath = `/img/${filename}`;
    } catch {}
  }
  const fields: string[] = [];
  const vals: any[] = [];
  if (nombre!=null) { fields.push("nombre=$2"); vals.push(nombre); }
  if (apellidos!=null) { fields.push("apellidos=$"+(vals.length+2)); vals.push(apellidos); }
  if (fotoPath) { fields.push("foto_perfil_path=$"+(vals.length+2)); vals.push(fotoPath); }
  if (fields.length===0) { const out = await pool.query("SELECT id, nombre, apellidos, puntos_acumulados, kg_totales, reputacion_promedio, resenas_recibidas_count, foto_perfil_path FROM usuarios WHERE id=$1", [id]); res.json(out.rows[0]||null); return; }
  const setClause = fields.join(", ");
  const q = `UPDATE usuarios SET ${setClause} WHERE id=$1 RETURNING id, nombre, apellidos, puntos_acumulados, kg_totales, reputacion_promedio, resenas_recibidas_count, foto_perfil_path`;
  const r = await pool.query(q, [id, ...vals]);
  res.json(r.rows[0]||null);
}));

const RECOMPENSAS = [
  { key: 'cinemark_entrada', nombre: 'Entrada de cine Cinemark', costo: 500 },
  { key: 'bembos_vale', nombre: 'Vale hamburguesa Bembos', costo: 320 },
  { key: 'plaza_vea_vale', nombre: 'Vale compras Plaza Vea', costo: 450 },
  { key: 'movilidad_descuento', nombre: 'Descuento en movilidad', costo: 200 }
];

usuariosRouter.get("/recompensas", asyncHandler(async (_req: Request, res: Response) => {
  res.json(RECOMPENSAS);
}));

usuariosRouter.post("/:id/recompensas/redimir", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { reward_key } = req.body;
  const r = RECOMPENSAS.find(x=>x.key===String(reward_key));
  if (!r) { res.status(400).json({ error: 'reward_not_found' }); return; }
  try {
    const out = await redimirPuntosUsuario(id, Number(r.costo), String(r.key));
    res.json({ ok: true, nuevo_puntos: out.nuevo_puntos });
  } catch (e: any) {
    if (String(e.message)==='insufficient_points') { res.status(400).json({ error: 'insufficient_points' }); return; }
    res.status(400).json({ error: 'redeem_failed' });
  }
}));

usuariosRouter.get("/:id/puntos/gastos", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const rows = await pool.query(
    "SELECT reward_key, puntos, creado_en FROM usuario_puntos_gastos WHERE usuario_id=$1 ORDER BY creado_en DESC",
    [id]
  );
  res.json(rows.rows);
}));

usuariosRouter.post("/:id/ubicacion_actual", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { lat, lon } = req.body;
  if (lat === undefined || lon === undefined) { res.status(400).json({ error: "invalid_coords" }); return; }
  const u = await actualizarUbicacionActualUsuario(id, Number(lat), Number(lon));
  res.json({ ok: true, usuario: u });
}));
