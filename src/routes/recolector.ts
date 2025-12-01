import { Router, Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { listarSolicitudesPublicadas, aceptarPorRecolector, actualizarEstadoOperativo, guardarItemsSolicitudJSON, obtenerSolicitud, historialRecolector } from "../repositories/solicitudesRepo";
import { recalcularClasificacionYFee, haversineKm, updateDeliveryProximityAndState } from "../services/solicitudesService";
import { obtenerTransaccionPorSolicitud, obtenerPesajesTransaccion } from "../repositories/transaccionesRepo";
import { obtenerUsuario } from "../repositories/usuariosRepo";
import { obtenerEmpresa } from "../repositories/empresasRepo";
import { pool } from "../db/pool";

export const recolectorRouter = Router();

recolectorRouter.get("/feed", asyncHandler(async (req: Request, res: Response) => {
  console.log("reco_feed");
  const list = await listarSolicitudesPublicadas();
  console.log("reco_feed_out", { count: Array.isArray(list)?list.length:0 });
  res.json(list);
}));

recolectorRouter.get("/:id/en_curso", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  console.log("reco_en_curso_in", { id });
  const rows = await pool.query(
    "SELECT * FROM solicitudes WHERE recolector_id=$1 AND tipo_entrega='delivery' AND estado_publicacion='aceptada_recolector' AND (estado IS DISTINCT FROM 'completada') ORDER BY creado_en DESC",
    [id]
  );
  console.log("reco_en_curso_out", { id, count: rows.rows.length });
  res.json(rows.rows);
}));

recolectorRouter.get("/by_email", asyncHandler(async (req: Request, res: Response) => {
  const email = String((req.query as any).email || '');
  if (!email) { res.status(400).json({ error: "email_requerido" }); return; }
  console.log("reco_by_email_in", { email });
  const r = await pool.query("SELECT id, email FROM recolectores WHERE email=$1", [email]);
  if (!r.rows[0]) { res.status(404).json({ error: "not_found" }); return; }
  console.log("reco_by_email_out", { id: Number(r.rows[0].id) });
  res.json(r.rows[0]);
}));

recolectorRouter.post("/:sid/aceptar", asyncHandler(async (req: Request, res: Response) => {
  const sid = Number(req.params.sid);
  const { recolector_id, vehiculo_id, lat, lon } = req.body;
  console.log("reco_aceptar_in", { sid, recolector_id, vehiculo_id, lat, lon });
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
    console.log("reco_aceptar_err", { sid, message: String(e?.message||'') });
    const msg = String(e?.message||'');
    if (msg === 'vehiculo_invalido' || msg === 'capacidad_insuficiente') { res.status(422).json({ error: msg }); return; }
    throw e;
  }
  if (!s) { res.status(409).json({ error: "no_disponible" }); return; }
  try { await recalcularClasificacionYFee(sid); } catch {}
  const s2 = await obtenerSolicitud(sid);
  console.log("reco_aceptar_ok", { sid, recolector_id: Number((s2||s)?.recolector_id||0) });
  try {
    const subs: any = (global as any).__notifSubs || ((global as any).__notifSubs = {});
    const notify = async (destRole: string, destId: number, tipo: string, mensaje: string) => {
      const safeId = (destId!=null && !Number.isNaN(destId) && destId>0) ? destId : null;
      if (!safeId) return;
      const payload = `event: notif\ndata: ${JSON.stringify({ solicitud_id: sid, actor_destino: destRole, destino_id: Number(destId), tipo, mensaje })}\n\n`;
      try { await pool.query("INSERT INTO notificaciones(solicitud_id, actor_destino, destino_id, tipo, mensaje) VALUES($1,$2,$3,$4,$5)", [sid, destRole, safeId, tipo, mensaje]); console.log("notif_insert_ok", { sid, actor_destino: destRole, destino_id: safeId, tipo }); } catch { console.log("notif_insert_err", { sid, actor_destino: destRole, destino_id: safeId, tipo }); }
      const k = `${destRole}:${destId}`;
      const arr = subs[k] || [];
      for (const r of arr) { try { r.write(payload); } catch {} }
      console.log("notif_emit", { destino: k, listeners: arr.length, tipo });
    };
    const usuarioId = Number((s2||s)?.usuario_id);
    const recoId = Number((s2||s)?.recolector_id);
    if (usuarioId && !Number.isNaN(usuarioId)) {
      await notify('usuario', usuarioId, 'aceptada_recolector', 'Tu solicitud delivery fue aceptada por un recolector');
    }
    if (recoId && !Number.isNaN(recoId)) {
      await notify('recolector', recoId, 'pedido_asignado', 'Se te asignó un pedido delivery');
    }
    try {
      const srow = await obtenerSolicitud(sid);
      const u = await obtenerUsuario(Number(srow?.usuario_id));
      const e = await obtenerEmpresa(Number(srow?.empresa_id));
      const useCur = Boolean(srow?.usuario_pick_actual);
      const uLat = useCur && u?.current_lat!=null ? Number(u.current_lat) : (u?.home_lat!=null ? Number(u.home_lat) : null);
      const uLon = useCur && u?.current_lon!=null ? Number(u.current_lon) : (u?.home_lon!=null ? Number(u.home_lon) : null);
      const rLat = (req.body?.lat!=null) ? Number(req.body.lat) : null;
      const rLon = (req.body?.lon!=null) ? Number(req.body.lon) : null;
      if (rLat!=null && rLon!=null && uLat!=null && uLon!=null) {
        const dUserKm = haversineKm(Number(rLat), Number(rLon), Number(uLat), Number(uLon));
        if (dUserKm <= 0.8) {
          const ex = await pool.query("SELECT 1 FROM notificaciones WHERE solicitud_id=$1 AND tipo='solicitar_confirmaciones' LIMIT 1", [sid]);
          if (!ex.rows[0]) {
            await notify('usuario', usuarioId, 'solicitar_confirmaciones', 'Confirma llegada del recolector');
            await notify('recolector', recoId, 'solicitar_confirmaciones', 'Confirma que ya recogiste del usuario');
          }
          const ex2 = await pool.query("SELECT 1 FROM notificaciones WHERE solicitud_id=$1 AND tipo IN ('cerca_usuario','cerca_recolector') LIMIT 1", [sid]);
          if (!ex2.rows[0]) {
            await notify('usuario', usuarioId, 'cerca_recolector', 'Recolector está a 0.8 km de tu ubicación');
            await notify('recolector', recoId, 'cerca_usuario', 'Estás a 0.8 km de la casa del usuario');
          }
          try { await pool.query("UPDATE solicitudes SET estado='cerca_usuario' WHERE id=$1", [sid]); } catch {}
          console.log('reco_aceptar_near_user', { sid, dUserKm });
        }
      }
      
      await updateDeliveryProximityAndState(sid, lat!=null?Number(lat):null, lon!=null?Number(lon):null);
    } catch {}
  } catch {}
  res.json(s2 || s);
}));

recolectorRouter.post("/:sid/estado", asyncHandler(async (req: Request, res: Response) => {
  const sid = Number(req.params.sid);
  const { estado } = req.body;
  console.log("reco_estado_in", { sid, estado });
  const s = await actualizarEstadoOperativo(sid, String(estado));
  res.json(s);
}));

recolectorRouter.post("/vehiculos", asyncHandler(async (req: Request, res: Response) => {
  const { recolector_id, tipo, tipo_id, placa, capacidad_kg } = req.body;
  if (!recolector_id || !placa || capacidad_kg==null) { res.status(400).json({ error: "invalid_body" }); return; }
  console.log("vehiculo_add_in", { recolector_id, tipo, tipo_id, placa, capacidad_kg });
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
  console.log("vehiculo_add_ok", { id: Number((r.rows[0]||{}).id||0) });
  res.json(r.rows[0] || null);
}));

recolectorRouter.get("/:id/vehiculos", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  console.log("vehiculos_list_in", { id });
  const r = await pool.query("SELECT * FROM vehiculos WHERE recolector_id=$1 ORDER BY creado_en DESC", [id]);
  console.log("vehiculos_list_out", { id, count: r.rows.length });
  res.json(r.rows);
}));

recolectorRouter.patch("/vehiculos/:vid", asyncHandler(async (req: Request, res: Response) => {
  const vid = Number(req.params.vid);
  const { recolector_id, capacidad_kg, activo, tipo, tipo_id } = req.body;
  if (!recolector_id) { res.status(400).json({ error: "invalid_body" }); return; }
  console.log("vehiculo_update_in", { vid, recolector_id, capacidad_kg, activo, tipo, tipo_id });
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
  console.log("vehiculo_update_ok", { id: Number((r.rows[0]||{}).id||0) });
  res.json(r.rows[0] || null);
}));

recolectorRouter.post("/:id/ubicacion_actual", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { lat, lon } = req.body;
  if (lat === undefined || lon === undefined) { res.status(400).json({ error: "invalid_coords" }); return; }
  console.log("reco_ubic_in", { id, lat, lon });
  const r = await pool.query("UPDATE recolectores SET lat=$2, lon=$3 WHERE id=$1 RETURNING *", [id, Number(lat), Number(lon)]);
  console.log("reco_ubic_update_ok", { id });
  try {
    const actives = await pool.query("SELECT id FROM solicitudes WHERE recolector_id=$1 AND tipo_entrega='delivery' AND estado_publicacion='aceptada_recolector' AND (estado IS DISTINCT FROM 'completada')", [id]);
    for (const s of actives.rows) {
      await updateDeliveryProximityAndState(Number(s.id), Number(lat), Number(lon));
    }
  } catch {}
  res.json({ ok: true, recolector: r.rows[0] || null });
}));

recolectorRouter.post("/:sid/items", asyncHandler(async (req: Request, res: Response) => {
  const sid = Number(req.params.sid);
  const items = Array.isArray(req.body?.items) ? req.body.items.map((it: any)=>({ material_id: Number(it.material_id), kg: Number(it.kg) })) : [];
  console.log("reco_items_in", { sid, count: items.length });
  const s = await guardarItemsSolicitudJSON(sid, items);
  res.json(s);
}));

recolectorRouter.get("/:id/historial", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  console.log("reco_historial_in", { id });
  const list = await historialRecolector(id);
  console.log("reco_historial_out", { id, count: Array.isArray(list)?list.length:0 });
  res.json(list);
}));

 

recolectorRouter.get("/previsualizacion/:sid", asyncHandler(async (req: Request, res: Response) => {
  const sid = Number(req.params.sid);
  console.log("reco_previsualizacion_in", { sid });
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
  console.log("reco_previsualizacion_out", { sid, distRU, distUE, uPickLat, uPickLon, eLat, eLon, rLat, rLon });
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
  console.log("reco_trabajo_detalle_in", { sid });
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
  console.log("reco_trabajo_detalle_out", { sid, totalKg, distRU, distUE });
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
  console.log("reco_stats_recompute_in");
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
  console.log("reco_stats_recompute_out", { count: updated.length });
  res.json({ updated });
}));
recolectorRouter.get("/vehiculos_tipos", asyncHandler(async (_req: Request, res: Response) => {
  console.log("vehiculos_tipos_in");
  const r = await pool.query("SELECT id, nombre FROM vehiculo_tipos WHERE activo=true ORDER BY nombre");
  console.log("vehiculos_tipos_out", { count: r.rows.length });
  res.json(r.rows);
}));
