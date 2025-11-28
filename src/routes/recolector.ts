import { Router, Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { listarSolicitudesPublicadas, aceptarPorRecolector, actualizarEstadoOperativo, guardarItemsSolicitudJSON, obtenerSolicitud, historialRecolector } from "../repositories/solicitudesRepo";
import { obtenerTransaccionPorSolicitud, obtenerPesajesTransaccion } from "../repositories/transaccionesRepo";
import { obtenerUsuario } from "../repositories/usuariosRepo";
import { obtenerEmpresa } from "../repositories/empresasRepo";
import { pool } from "../db/pool";

export const recolectorRouter = Router();

recolectorRouter.get("/feed", asyncHandler(async (req: Request, res: Response) => {
  const list = await listarSolicitudesPublicadas();
  res.json(list);
}));

recolectorRouter.post("/:sid/aceptar", asyncHandler(async (req: Request, res: Response) => {
  const sid = Number(req.params.sid);
  const { recolector_id, lat, lon } = req.body;
  const s = await aceptarPorRecolector(sid, Number(recolector_id), lat!=null?Number(lat):null, lon!=null?Number(lon):null);
  if (!s) { res.status(409).json({ error: "no_disponible" }); return; }
  res.json(s);
}));

recolectorRouter.post(":sid/estado", asyncHandler(async (req: Request, res: Response) => {
  const sid = Number(req.params.sid);
  const { estado } = req.body;
  const s = await actualizarEstadoOperativo(sid, String(estado));
  res.json(s);
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
  let recolector: any = null;
  if (snapLat != null && snapLon != null) {
    recolector = { lat: Number(snapLat), lon: Number(snapLon) };
  } else {
    const rlatlon = await pool.query("SELECT lat, lon FROM recolectores WHERE id=$1", [Number(s.recolector_id)]);
    recolector = rlatlon.rows[0] || null;
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
