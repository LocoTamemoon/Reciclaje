import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import { pool } from "../db/pool";
import { listarEmpresas, materialesDeEmpresa, crearEmpresa, actualizarUbicacionEmpresaPorRuc, statsEmpresasTransacciones, statsDistritosTransacciones } from "../repositories/empresasRepo";
import { historialEmpresa } from "../repositories/transaccionesRepo";
import { upsertEmpresaMaterialPrecio, eliminarEmpresaMaterial } from "../repositories/materialesRepo";
import { solicitudesPendientesEmpresa } from "../repositories/solicitudesRepo";
import { aceptarSolicitud, rechazarSolicitud } from "../services/solicitudesService";
import { obtenerSolicitud } from "../repositories/solicitudesRepo";
import { registrarPesajeYPago } from "../services/pagosService";
import { asyncHandler } from "../middleware/asyncHandler";

export const empresasRouter = Router();

empresasRouter.get("/", asyncHandler(async (req: Request, res: Response) => {
  const data = await listarEmpresas();
  res.json(data);
}));

empresasRouter.post("/", asyncHandler(async (req: Request, res: Response) => {
  const { ruc, nombre, logo, lat, lon } = req.body;
  const empresa = await crearEmpresa(String(ruc), String(nombre), logo ? String(logo) : null, lat !== undefined ? Number(lat) : null, lon !== undefined ? Number(lon) : null);
  res.status(201).json(empresa);
}));

empresasRouter.get("/:id/materiales", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const data = await materialesDeEmpresa(id);
  res.json(data);
}));

empresasRouter.post("/:id/materiales/upsert", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  try {
    const st = await pool.query("SELECT estado FROM empresas WHERE id=$1", [id]);
    const activo = Boolean(st.rows[0]?.estado);
    if (!activo) { res.status(422).json({ error: "empresa_inactiva" }); return; }
  } catch {}
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const results = [] as any[];
  for (const it of items) {
    const r = await upsertEmpresaMaterialPrecio(id, Number(it.material_id), Number(it.precio_por_kg), it.condiciones != null ? String(it.condiciones) : null);
    results.push(r);
  }
  res.json({ updated: results.length });
}));

empresasRouter.delete("/:id/materiales/:mid", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const mid = Number(req.params.mid);
  try {
    const st = await pool.query("SELECT estado FROM empresas WHERE id=$1", [id]);
    const activo = Boolean(st.rows[0]?.estado);
    if (!activo) { res.status(422).json({ error: "empresa_inactiva" }); return; }
  } catch {}
  await eliminarEmpresaMaterial(id, mid);
  res.json({ removed: true });
}));

empresasRouter.get("/:id/solicitudes", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const data = await solicitudesPendientesEmpresa(id);
  res.json(data);
}));

empresasRouter.post("/:id/solicitudes/:sid/aceptar", asyncHandler(async (req: Request, res: Response) => {
  const empresaId = Number(req.params.id);
  const solicitudId = Number(req.params.sid);
  try {
    const st = await pool.query("SELECT estado FROM empresas WHERE id=$1", [empresaId]);
    const activo = Boolean(st.rows[0]?.estado);
    if (!activo) { res.status(422).json({ error: "empresa_inactiva" }); return; }
  } catch {}
  const s = await aceptarSolicitud(empresaId, solicitudId);
  const sol = await obtenerSolicitud(solicitudId);
  const items = Array.isArray((sol as any)?.items_json) ? (sol as any).items_json : [];
  const pesajes = items.map((it: any)=>({ material_id: Number(it.material_id), kg_finales: Number(it.kg) }));
  const t = await registrarPesajeYPago(
    empresaId,
    solicitudId,
    Number(s.usuario_id),
    "efectivo",
    null,
    null,
    pesajes
  );
  res.json({ solicitud: s, transaccion: t });
}));

empresasRouter.post("/:id/solicitudes/:sid/rechazar", asyncHandler(async (req: Request, res: Response) => {
  const empresaId = Number(req.params.id);
  const solicitudId = Number(req.params.sid);
  try {
    const st = await pool.query("SELECT estado FROM empresas WHERE id=$1", [empresaId]);
    const activo = Boolean(st.rows[0]?.estado);
    if (!activo) { res.status(422).json({ error: "empresa_inactiva" }); return; }
  } catch {}
  const s = await rechazarSolicitud(empresaId, solicitudId);
  res.json(s);
}));

empresasRouter.post("/:id/solicitudes/:sid/pesaje_pago", asyncHandler(async (req: Request, res: Response) => {
  const empresaId = Number(req.params.id);
  const solicitudId = Number(req.params.sid);
  const { usuario_id, metodo_pago, lat, lon, pesajes } = req.body;
  try {
    const st = await pool.query("SELECT estado FROM empresas WHERE id=$1", [empresaId]);
    const activo = Boolean(st.rows[0]?.estado);
    if (!activo) { res.status(422).json({ error: "empresa_inactiva" }); return; }
  } catch {}
  const t = await registrarPesajeYPago(
    empresaId,
    solicitudId,
    Number(usuario_id),
    String(metodo_pago),
    lat !== undefined ? Number(lat) : null,
    lon !== undefined ? Number(lon) : null,
    Array.isArray(pesajes) ? pesajes.map((p: any) => ({ material_id: Number(p.material_id), kg_finales: Number(p.kg_finales) })) : []
  );
  res.json(t);
}));

empresasRouter.post("/set_loc", asyncHandler(async (req: Request, res: Response) => {
  const { ruc, lat, lon } = req.body as any;
  const e = await actualizarUbicacionEmpresaPorRuc(String(ruc), Number(lat), Number(lon));
  res.json(e);
}));

empresasRouter.get("/:id/historial", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const list = await historialEmpresa(id);
  res.json(list);
}));

empresasRouter.get("/stats", asyncHandler(async (_req: Request, res: Response) => {
  const stats = await statsEmpresasTransacciones();
  res.json(stats);
}));

empresasRouter.get("/stats_distritos", asyncHandler(async (_req: Request, res: Response) => {
  const stats = await statsDistritosTransacciones();
  res.json(stats);
}));

empresasRouter.get("/:id/perfil", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const eRes = await pool.query("SELECT id, ruc, nombre, logo, reputacion_promedio, resenas_recibidas_count, foto_local_1, foto_local_2, foto_local_3, estado FROM empresas WHERE id=$1", [id]);
  const emp = eRes.rows[0] || null;
  if (!emp) { res.status(404).json({ error: "not_found" }); return; }
  if (!emp.estado) { res.status(403).json({ error: "empresa_inactiva" }); return; }
  const matsRes = await pool.query("SELECT COUNT(*)::int AS c FROM empresa_materiales_precio WHERE empresa_id=$1", [id]);
  const txRes = await pool.query("SELECT COUNT(*)::int AS c FROM transacciones WHERE empresa_id=$1", [id]);
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

empresasRouter.patch("/:id/perfil", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const nombre = req.body?.nombre != null ? String(req.body.nombre) : null;
  const logoBase64 = req.body?.logo_base64 != null ? String(req.body.logo_base64) : null;
  const f1Base64 = req.body?.foto_local_1_base64 != null ? String(req.body.foto_local_1_base64) : null;
  const f2Base64 = req.body?.foto_local_2_base64 != null ? String(req.body.foto_local_2_base64) : null;
  const f3Base64 = req.body?.foto_local_3_base64 != null ? String(req.body.foto_local_3_base64) : null;
  const dir = path.resolve("public", "img");
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  function saveImg(b64?: string | null): string | null {
    if (!b64) return null;
    try {
      const code = Date.now().toString(36);
      const filename = `${id}_empresa_${code}.png`;
      const full = path.join(dir, filename);
      const data = /^data:image\/(png|jpeg);base64,/i.test(String(b64)) ? String(b64).replace(/^data:image\/(png|jpeg);base64,/i, "") : String(b64);
      const buf = Buffer.from(data, "base64");
      fs.writeFileSync(full, buf);
      return `/img/${filename}`;
    } catch { return null; }
  }
  const logoPath = saveImg(logoBase64);
  const f1Path = saveImg(f1Base64);
  const f2Path = saveImg(f2Base64);
  const f3Path = saveImg(f3Base64);
  const sets: string[] = [];
  const vals: any[] = [];
  if (nombre != null) { sets.push(`nombre=$${sets.length+2}`); vals.push(nombre); }
  if (logoPath) { sets.push(`logo=$${sets.length+2}`); vals.push(logoPath); }
  if (f1Path) { sets.push(`foto_local_1=$${sets.length+2}`); vals.push(f1Path); }
  if (f2Path) { sets.push(`foto_local_2=$${sets.length+2}`); vals.push(f2Path); }
  if (f3Path) { sets.push(`foto_local_3=$${sets.length+2}`); vals.push(f3Path); }
  if (sets.length === 0) {
    const cur = await pool.query("SELECT id, ruc, nombre, logo, reputacion_promedio, resenas_recibidas_count, foto_local_1, foto_local_2, foto_local_3 FROM empresas WHERE id=$1", [id]);
    res.json(cur.rows[0] || null);
    return;
  }
  const sql = `UPDATE empresas SET ${sets.join(", ")} WHERE id=$1 RETURNING id, ruc, nombre, logo, reputacion_promedio, resenas_recibidas_count, foto_local_1, foto_local_2, foto_local_3`;
  const r = await pool.query(sql, [id, ...vals]);
  res.json(r.rows[0] || null);
}));
