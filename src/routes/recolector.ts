import { Router, Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { listarSolicitudesPublicadas, aceptarPorRecolector, actualizarEstadoOperativo, guardarItemsSolicitudJSON, obtenerSolicitud, historialRecolector } from "../repositories/solicitudesRepo";
import { recalcularClasificacionYFee } from "../services/solicitudesService";
import { obtenerTransaccionPorSolicitud, obtenerPesajesTransaccion } from "../repositories/transaccionesRepo";
import { obtenerUsuario } from "../repositories/usuariosRepo";
import { obtenerEmpresa } from "../repositories/empresasRepo";
import { pool } from "../db/pool";

export const recolectorRouter = Router();

recolectorRouter.get("/feed", asyncHandler(async (req: Request, res: Response) => {
  const list = await listarSolicitudesPublicadas();
  res.json(list);
}));

recolectorRouter.get("/:id/en_curso", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const rows = await pool.query(
    "SELECT * FROM solicitudes WHERE recolector_id=$1 AND tipo_entrega='delivery' AND estado_publicacion='aceptada_recolector' AND (estado IS DISTINCT FROM 'completada') ORDER BY creado_en DESC",
    [id]
  );
  res.json(rows.rows);
}));

recolectorRouter.get("/by_email", asyncHandler(async (req: Request, res: Response) => {
  const email = String((req.query as any).email || '');
  if (!email) { res.status(400).json({ error: "email_requerido" }); return; }
  const r = await pool.query("SELECT id, email FROM recolectores WHERE email=$1", [email]);
  if (!r.rows[0]) { res.status(404).json({ error: "not_found" }); return; }
  res.json(r.rows[0]);
}));

recolectorRouter.post("/:sid/aceptar", asyncHandler(async (req: Request, res: Response) => {
  const sid = Number(req.params.sid);
  const { recolector_id, vehiculo_id, lat, lon } = req.body;
  let s: any = null;
  try {
    s = await aceptarPorRecolector(
      sid,
      Number(recolector_id),
      vehiculo_id!=null?Number(vehiculo_id):null,
      lat!=null?Number(lat):null,
      lon!=null?Number(lon):null
    );
  } catch (e: any) {
    const msg = String(e?.message||'');
    if (msg === 'vehiculo_invalido' || msg === 'capacidad_insuficiente') { res.status(422).json({ error: msg }); return; }
    throw e;
  }
  if (!s) { res.status(409).json({ error: "no_disponible" }); return; }
  try { await recalcularClasificacionYFee(sid); } catch {}
  const s2 = await obtenerSolicitud(sid);
  res.json(s2 || s);
}));

recolectorRouter.post(":sid/estado", asyncHandler(async (req: Request, res: Response) => {
  const sid = Number(req.params.sid);
  const { estado } = req.body;
  const s = await actualizarEstadoOperativo(sid, String(estado));
  res.json(s);
}));

recolectorRouter.post("/vehiculos", asyncHandler(async (req: Request, res: Response) => {
  const { recolector_id, tipo, tipo_id, placa, capacidad_kg } = req.body;
  if (!recolector_id || !placa || capacidad_kg==null) { res.status(400).json({ error: "invalid_body" }); return; }
  let tipoId: number | null = null;
  if (tipo_id != null) {
    const t = await pool.query("SELECT id FROM vehiculo_tipos WHERE id=$1 AND activo=true", [Number(tipo_id)]);
    if (!t.rows[0]) { res.status(422).json({ error: "tipo_invalido" }); return; }
    tipoId = Number(t.rows[0].id);
  } else if (tipo) {
    const t = await pool.query("SELECT id FROM vehiculo_tipos WHERE LOWER(nombre)=LOWER($1) AND activo=true", [String(tipo)]);
    if (!t.rows[0]) { res.status(422).json({ error: "tipo_invalido" }); return; }
    tipoId = Number(t.rows[0].id);
  } else {
    res.status(400).json({ error: "tipo_requerido" }); return;
  }
  const r = await pool.query(
    "INSERT INTO vehiculos(recolector_id, tipo_id, placa, capacidad_kg, activo) VALUES($1,$2,$3,$4,true) RETURNING *",
    [Number(recolector_id), tipoId, String(placa), Number(capacidad_kg)]
  );
  res.json(r.rows[0] || null);
}));

recolectorRouter.get("/:id/vehiculos", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const r = await pool.query("SELECT * FROM vehiculos WHERE recolector_id=$1 ORDER BY creado_en DESC", [id]);
  res.json(r.rows);
}));

recolectorRouter.patch("/vehiculos/:vid", asyncHandler(async (req: Request, res: Response) => {
  const vid = Number(req.params.vid);
  const { recolector_id, capacidad_kg, activo, tipo, tipo_id } = req.body;
  if (!recolector_id) { res.status(400).json({ error: "invalid_body" }); return; }
  const owner = await pool.query("SELECT id FROM vehiculos WHERE id=$1 AND recolector_id=$2", [vid, Number(recolector_id)]);
  if (!owner.rows[0]) { res.status(404).json({ error: "vehiculo_not_found" }); return; }
  let tipoId: number | null = tipo_id!=null ? Number(tipo_id) : null;
  if (tipo_id != null) {
    const t = await pool.query("SELECT id FROM vehiculo_tipos WHERE id=$1 AND activo=true", [Number(tipo_id)]);
    if (!t.rows[0]) { res.status(422).json({ error: "tipo_invalido" }); return; }
    tipoId = Number(t.rows[0].id);
  } else if (tipo != null) {
    const t = await pool.query("SELECT id FROM vehiculo_tipos WHERE LOWER(nombre)=LOWER($1) AND activo=true", [String(tipo)]);
    if (!t.rows[0]) { res.status(422).json({ error: "tipo_invalido" }); return; }
    tipoId = Number(t.rows[0].id);
  }
  const r = await pool.query(
    "UPDATE vehiculos SET capacidad_kg=COALESCE($3, capacidad_kg), activo=COALESCE($4, activo), tipo_id=COALESCE($5, tipo_id) WHERE id=$1 RETURNING *",
    [vid, Number(recolector_id), capacidad_kg!=null?Number(capacidad_kg):null, activo!=null?Boolean(activo):null, tipoId]
  );
  res.json(r.rows[0] || null);
}));

recolectorRouter.post("/:id/ubicacion_actual", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { lat, lon } = req.body;
  if (lat === undefined || lon === undefined) { res.status(400).json({ error: "invalid_coords" }); return; }
  const r = await pool.query("UPDATE recolectores SET lat=$2, lon=$3 WHERE id=$1 RETURNING *", [id, Number(lat), Number(lon)]);
  res.json({ ok: true, recolector: r.rows[0] || null });
}));

recolectorRouter.post("/:sid/items", asyncHandler(async (req: Request, res: Response) => {
  const sid = Number(req.params.sid);
  const items = Array.isArray(req.body?.items) ? req.body.items.map((it: any)=>({ material_id: Number(it.material_id), kg: Number(it.kg) })) : [];
  const s = await guardarItemsSolicitudJSON(sid, items);
  res.json(s);
}));

recolectorRouter.get("/:id/historial", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const list = await historialRecolector(id);
  res.json(list);
}));

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

recolectorRouter.get("/previsualizacion/:sid", asyncHandler(async (req: Request, res: Response) => {
  const sid = Number(req.params.sid);
  const s = await obtenerSolicitud(sid);
  if (!s) { res.status(404).json({ error: "not_found" }); return; }
  const usuario = await obtenerUsuario(Number(s.usuario_id));
  const empresa = await obtenerEmpresa(Number(s.empresa_id));
  const snapLat = (s as any)?.recolector_accept_lat;
  const snapLon = (s as any)?.recolector_accept_lon;
  const viewerId = Number((req.query.viewer_id as any) || NaN);
  let recolector: any = null;
  if (snapLat != null && snapLon != null) {
    recolector = { lat: Number(snapLat), lon: Number(snapLon) };
  } else {
    let lookupId = Number(s.recolector_id);
    if (!lookupId || isNaN(lookupId)) lookupId = !isNaN(viewerId) ? viewerId : NaN;
    if (lookupId && !isNaN(lookupId)) {
      const rlatlon = await pool.query("SELECT lat, lon FROM recolectores WHERE id=$1", [lookupId]);
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
  const useCur = Boolean((s as any)?.usuario_pick_actual);
  const uPickLat = useCur && uCurLat!=null ? uCurLat : uHomeLat;
  const uPickLon = useCur && uCurLon!=null ? uCurLon : uHomeLon;
  const distRU = (rLat!=null && rLon!=null && uPickLat!=null && uPickLon!=null) ? haversineKm(rLat, rLon, uPickLat, uPickLon) : null;
  const distUE = (uPickLat!=null && uPickLon!=null && eLat!=null && eLon!=null) ? haversineKm(uPickLat, uPickLon, eLat, eLon) : null;
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

recolectorRouter.get("/trabajos/:sid/detalle", asyncHandler(async (req: Request, res: Response) => {
  const sid = Number(req.params.sid);
  const s = await obtenerSolicitud(sid);
  if (!s) { res.status(404).json({ error: "not_found" }); return; }
  const tx = await obtenerTransaccionPorSolicitud(sid);
  if (!tx) { res.status(404).json({ error: "tx_not_found" }); return; }
  const pesajes = await obtenerPesajesTransaccion(Number(tx.id));
  const totalKg = pesajes.reduce((a: number, p: any)=> a + Number(p.kg_finales||0), 0);
  const usuario = await obtenerUsuario(Number(s.usuario_id));
  const empresa = await obtenerEmpresa(Number(s.empresa_id));
  const snapLat2 = (s as any)?.recolector_accept_lat;
  const snapLon2 = (s as any)?.recolector_accept_lon;
  let recolector: any = null;
  if (snapLat2 != null && snapLon2 != null) {
    recolector = { lat: Number(snapLat2), lon: Number(snapLon2) };
  } else {
    const recoRow = await pool.query("SELECT lat, lon FROM recolectores WHERE id=$1", [Number(s.recolector_id)]);
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
  const useCur2 = Boolean((s as any)?.usuario_pick_actual);
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

recolectorRouter.post("/stats/recompute_all", asyncHandler(async (_req: Request, res: Response) => {
  const idsRes = await pool.query("SELECT id FROM recolectores");
  const updated: { id: number; trabajos_completados: number }[] = [];
  for (const r of idsRes.rows) {
    const id = Number(r.id);
    const cRes = await pool.query(
      "SELECT COUNT(*)::int AS c FROM solicitudes WHERE recolector_id=$1 AND tipo_entrega='delivery' AND estado='completada'",
      [id]
    );
    const c = Number((cRes.rows[0] || {}).c || 0);
    await pool.query("UPDATE recolectores SET trabajos_completados=$2 WHERE id=$1", [id, c]);
    updated.push({ id, trabajos_completados: c });
  }
  res.json({ updated });
}));
recolectorRouter.get("/vehiculos_tipos", asyncHandler(async (_req: Request, res: Response) => {
  const r = await pool.query("SELECT id, nombre FROM vehiculo_tipos WHERE activo=true ORDER BY nombre");
  res.json(r.rows);
}));
