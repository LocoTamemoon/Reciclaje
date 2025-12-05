import { Router, Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { listarSolicitudesPublicadas, aceptarPorRecolector, actualizarEstadoOperativo, guardarItemsSolicitudJSON, obtenerSolicitud, historialRecolector } from "../repositories/solicitudesRepo";
import { recalcularClasificacionYFee, haversineKm, updateDeliveryProximityAndState } from "../services/solicitudesService";
import { obtenerTransaccionPorSolicitud, obtenerPesajesTransaccion } from "../repositories/transaccionesRepo";
import { obtenerUsuario } from "../repositories/usuariosRepo";
import { obtenerEmpresa } from "../repositories/empresasRepo";
import { pool } from "../db/pool";
import fs from "fs";
import path from "path";

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
  await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS handoff_state TEXT");
  await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS handoff_recolector_id INTEGER");
  await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS handoff_expires_at TIMESTAMPTZ");
  // cleanup expirados en_intercambio
  try { await pool.query("UPDATE solicitudes SET handoff_state=NULL, handoff_recolector_id=NULL, handoff_old_ok=false, handoff_new_ok=false, estado='rumbo_a_empresa' WHERE handoff_state='en_intercambio' AND handoff_expires_at IS NOT NULL AND handoff_expires_at <= NOW()"); } catch {}
  const rows = await pool.query(
    "SELECT * FROM solicitudes WHERE ((recolector_id=$1 AND tipo_entrega='delivery' AND estado_publicacion='aceptada_recolector' AND estado IN ('rumbo_usuario','cerca_usuario','rumbo_a_empresa','cerca_empresa','llego_empresa','entregado_empresa','empresa_confirmo_recepcion')) OR (handoff_state='en_intercambio' AND (handoff_expires_at IS NULL OR handoff_expires_at>NOW()) AND handoff_recolector_id=$1)) ORDER BY creado_en DESC LIMIT 1",
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
    if (msg === 'vehiculo_invalido' || msg === 'capacidad_insuficiente' || msg === 'vehiculo_obligatorio' || msg === 'recolector_ocupado') { res.status(422).json({ error: msg }); return; }
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

recolectorRouter.get("/vehiculo_tipos", asyncHandler(async (_req: Request, res: Response) => {
  const r = await pool.query("SELECT id, nombre FROM vehiculo_tipos WHERE activo=true ORDER BY nombre");
  res.json(r.rows);
}));

recolectorRouter.get("/:id/perfil", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  console.log("reco_perfil_in", { id });
  const r = await pool.query("SELECT id, email, lat, lon, id_distrito, nombre, apellidos, dni, estado, reputacion_promedio, resenas_recibidas_count, trabajos_completados, foto_perfil, foto_documento, foto_vehiculo FROM recolectores WHERE id=$1", [id]);
  if (!r.rows[0]) { res.status(404).json({ error: "not_found" }); return; }
  res.json(r.rows[0]);
}));

recolectorRouter.patch("/:id/perfil", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const fotoPerfilBase64 = req.body?.foto_perfil_base64 != null ? String(req.body.foto_perfil_base64) : null;
  const fotoDocBase64 = req.body?.foto_documento_base64 != null ? String(req.body.foto_documento_base64) : null;
  const fotoVehBase64 = req.body?.foto_vehiculo_base64 != null ? String(req.body.foto_vehiculo_base64) : null;
  const dir = path.resolve("public", "img");
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  function saveImg(b64: string | null, suffix: string): string | null {
    if (!b64) return null;
    try {
      const code = Date.now().toString(36);
      const filename = `${id}_reco_${suffix}_${code}.png`;
      const full = path.join(dir, filename);
      const data = /^data:image\/(png|jpeg);base64,/i.test(b64) ? b64.replace(/^data:image\/(png|jpeg);base64,/i, "") : b64;
      const buf = Buffer.from(data, "base64");
      fs.writeFileSync(full, buf);
      return `/img/${filename}`;
    } catch { return null; }
  }
  const perfilPath = saveImg(fotoPerfilBase64, "perfil");
  const docPath = saveImg(fotoDocBase64, "doc");
  const vehPath = saveImg(fotoVehBase64, "veh");
  const fields: string[] = [];
  const vals: any[] = [];
  if (perfilPath) { fields.push("foto_perfil=$" + (vals.length + 2)); vals.push(perfilPath); }
  if (docPath) { fields.push("foto_documento=$" + (vals.length + 2)); vals.push(docPath); }
  if (vehPath) { fields.push("foto_vehiculo=$" + (vals.length + 2)); vals.push(vehPath); }
  if (fields.length === 0) { const r = await pool.query("SELECT id, email, lat, lon, id_distrito, nombre, apellidos, dni, estado, reputacion_promedio, resenas_recibidas_count, trabajos_completados, foto_perfil, foto_documento, foto_vehiculo FROM recolectores WHERE id=$1", [id]); res.json(r.rows[0] || null); return; }
  const sql = `UPDATE recolectores SET ${fields.join(", ")} WHERE id=$1 RETURNING id, email, lat, lon, id_distrito, nombre, apellidos, dni, estado, reputacion_promedio, resenas_recibidas_count, trabajos_completados, foto_perfil, foto_documento, foto_vehiculo`;
  const r = await pool.query(sql, [id, ...vals]);
  res.json(r.rows[0] || null);
}));

recolectorRouter.get("/distritos", asyncHandler(async (_req: Request, res: Response) => {
  const r = await pool.query("SELECT id_distrito, nombre FROM distritos ORDER BY nombre");
  res.json(r.rows);
}));

recolectorRouter.patch("/:id/distrito", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const distrito_id = Number(req.body?.distrito_id);
  if (!id || Number.isNaN(id) || Number.isNaN(distrito_id)) { res.status(400).json({ error: "invalid_body" }); return; }
  const exists = await pool.query("SELECT 1 FROM distritos WHERE id_distrito=$1", [distrito_id]);
  if (!exists.rows[0]) { res.status(422).json({ error: "distrito_invalido" }); return; }
  const r = await pool.query("UPDATE recolectores SET id_distrito=$2 WHERE id=$1 RETURNING id, id_distrito", [id, distrito_id]);
  res.json(r.rows[0] || null);
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
  const actives = await pool.query("SELECT id FROM solicitudes WHERE recolector_id=$1 AND tipo_entrega='delivery' AND estado_publicacion='aceptada_recolector' AND estado IN ('rumbo_usuario','cerca_usuario','rumbo_a_empresa','cerca_empresa','llego_empresa','entregado_empresa','empresa_confirmo_recepcion')", [id]);
    for (const s of actives.rows) {
      await updateDeliveryProximityAndState(Number(s.id), Number(lat), Number(lon));
    }
  } catch {}
  res.json({ ok: true, recolector: r.rows[0] || null });
}));

recolectorRouter.get("/handoff/publicados", asyncHandler(async (req: Request, res: Response) => {
  const viewerId = Number((req.query.viewer_id as any) || NaN);
  await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS handoff_state TEXT");
  await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS handoff_expires_at TIMESTAMPTZ");
  const r = await pool.query(
    "SELECT id, usuario_id, empresa_id, recolector_id, handoff_pick_lat, handoff_pick_lon, handoff_expires_at FROM solicitudes WHERE handoff_state='publicado' AND (handoff_expires_at IS NULL OR handoff_expires_at > NOW()) ORDER BY creado_en DESC"
  );
  const list = r.rows.filter((row: any)=> Number(row.recolector_id||0) !== (Number.isNaN(viewerId)?0:viewerId));
  res.json(list);
}));

recolectorRouter.post("/:sid/handoff/request", asyncHandler(async (req: Request, res: Response) => {
  const sid = Number(req.params.sid);
  const recolectorId = Number(req.body?.recolector_id);
  if (!sid || Number.isNaN(recolectorId)) { res.status(400).json({ error: "invalid_body" }); return; }
  await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS handoff_state TEXT");
  await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS handoff_pick_lat NUMERIC(9,6)");
  await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS handoff_pick_lon NUMERIC(9,6)");
  await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS handoff_expires_at TIMESTAMPTZ");
  const sRes = await pool.query("SELECT estado, recolector_id FROM solicitudes WHERE id=$1", [sid]);
  const s = sRes.rows[0] || null;
  if (!s || Number(s.recolector_id) !== recolectorId) { res.status(403).json({ error: "no_owner" }); return; }
  const est = String(s.estado||'');
  if (!(est==='rumbo_a_empresa' || est==='cerca_empresa')) { res.status(422).json({ error: "etapa_invalida" }); return; }
  const rpos = await pool.query("SELECT lat, lon FROM recolectores WHERE id=$1", [recolectorId]);
  const pos = rpos.rows[0] || null;
  let curLat = pos?.lat!=null ? Number(pos.lat) : null;
  let curLon = pos?.lon!=null ? Number(pos.lon) : null;
  let pickLat: number | null = curLat;
  let pickLon: number | null = curLon;
  try { } catch {}
  await pool.query("UPDATE solicitudes SET handoff_state='publicado', handoff_pick_lat=$2, handoff_pick_lon=$3, handoff_expires_at = NOW() + INTERVAL '15 minutes' WHERE id=$1", [sid, pickLat, pickLon]);
  const subs: any = (global as any).__notifSubs || ((global as any).__notifSubs = {});
  const notify = async (destRole: string, destId: number, tipo: string, mensaje: string) => {
    const safeId = (destId!=null && !Number.isNaN(destId) && destId>0) ? destId : null;
    if (!safeId) return;
    const payload = `event: notif\ndata: ${JSON.stringify({ solicitud_id: sid, actor_destino: destRole, destino_id: Number(destId), tipo, mensaje })}\n\n`;
    try { await pool.query("INSERT INTO notificaciones(solicitud_id, actor_destino, destino_id, tipo, mensaje) VALUES($1,$2,$3,$4,$5)", [sid, destRole, safeId, tipo, mensaje]); } catch {}
    const k = `${destRole}:${destId}`;
    const arr = subs[k] || [];
    for (const r of arr) { try { r.write(payload); } catch {} }
  };
  await notify('recolector', recolectorId, 'handoff_publicado', 'Handoff publicado, esperando aceptante');
  res.json({ ok: true, handoff_state: 'publicado' });
}));

recolectorRouter.post("/:sid/handoff/accept", asyncHandler(async (req: Request, res: Response) => {
  const sid = Number(req.params.sid);
  const newRecoId = Number(req.body?.recolector_id);
  if (!sid || Number.isNaN(newRecoId)) { res.status(400).json({ error: "invalid_body" }); return; }
  await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS handoff_state TEXT");
  await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS handoff_recolector_id INTEGER");
  await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS handoff_expires_at TIMESTAMPTZ");
  const sRes = await pool.query("SELECT estado, recolector_id, handoff_state, handoff_expires_at FROM solicitudes WHERE id=$1", [sid]);
  const s = sRes.rows[0] || null;
  if (!s) { res.status(404).json({ error: "not_found" }); return; }
  if (String(s.handoff_state||'') !== 'publicado') { res.status(422).json({ error: "no_publicado" }); return; }
  const exp = s.handoff_expires_at ? new Date(s.handoff_expires_at) : null;
  if (exp && exp.getTime() <= Date.now()) { await pool.query("UPDATE solicitudes SET handoff_state=NULL, handoff_expires_at=NULL WHERE id=$1", [sid]); res.status(422).json({ error: "expirado" }); return; }
  if (Number(s.recolector_id) === newRecoId) { res.status(422).json({ error: "mismo_recolector" }); return; }
  const busy = await pool.query("SELECT 1 FROM solicitudes WHERE ((recolector_id=$1 AND tipo_entrega='delivery' AND estado_publicacion='aceptada_recolector' AND estado IN ('rumbo_usuario','cerca_usuario','rumbo_a_empresa','cerca_empresa')) OR (handoff_state='en_intercambio' AND (handoff_expires_at IS NULL OR handoff_expires_at>NOW()) AND handoff_recolector_id=$1)) LIMIT 1", [newRecoId]);
  if (busy.rows[0]) { res.status(422).json({ error: "recolector_ocupado" }); return; }
  await pool.query("UPDATE solicitudes SET handoff_state='en_intercambio', handoff_recolector_id=$2, handoff_old_ok=false, handoff_new_ok=false, handoff_expires_at = NOW() + INTERVAL '5 minutes' WHERE id=$1", [sid, newRecoId]);
  const chk = await pool.query("SELECT id, handoff_state, handoff_recolector_id FROM solicitudes WHERE id=$1", [sid]);
  console.log("handoff_accept_ok", { sid, newRecoId, row: chk.rows[0]||null });
  try {
    const posR2 = await pool.query("SELECT lat, lon FROM recolectores WHERE id=$1", [newRecoId]);
    const p = posR2.rows[0] || null;
    if (p && p.lat!=null && p.lon!=null){
      try { await pool.query("UPDATE solicitudes SET handoff_cur_lat=$2, handoff_cur_lon=$3 WHERE id=$1", [sid, Number(p.lat), Number(p.lon)]); } catch {}
    }
  } catch {}
  try { const hooks: any = (global as any).__handoffSimHooks; if (hooks && typeof hooks.iniciar === 'function') { await hooks.iniciar(sid); } } catch {}
  const subs: any = (global as any).__notifSubs || ((global as any).__notifSubs = {});
  const notify = async (destRole: string, destId: number, tipo: string, mensaje: string) => {
    const safeId = (destId!=null && !Number.isNaN(destId) && destId>0) ? destId : null;
    if (!safeId) return;
    const payload = `event: notif\ndata: ${JSON.stringify({ solicitud_id: sid, actor_destino: destRole, destino_id: Number(destId), tipo, mensaje })}\n\n`;
    try { await pool.query("INSERT INTO notificaciones(solicitud_id, actor_destino, destino_id, tipo, mensaje) VALUES($1,$2,$3,$4,$5)", [sid, destRole, safeId, tipo, mensaje]); } catch {}
    const k = `${destRole}:${destId}`;
    const arr = subs[k] || [];
    for (const r of arr) { try { r.write(payload); } catch {} }
  };
  await notify('recolector', Number(s.recolector_id), 'handoff_aceptado', 'Recolector 2 aceptó el handoff');
  await notify('recolector', newRecoId, 'handoff_aceptado', 'Dirígete al punto de encuentro para el handoff');
  res.json({ ok: true, handoff_state: 'en_intercambio' });
}));

recolectorRouter.post("/:sid/handoff/confirm_old", asyncHandler(async (req: Request, res: Response) => {
  const sid = Number(req.params.sid);
  const recoId = Number(req.body?.recolector_id);
  if (!sid || Number.isNaN(recoId)) { res.status(400).json({ error: "invalid_body" }); return; }
  await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS handoff_old_ok BOOLEAN");
  await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS handoff_recolector_id INTEGER");
  await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS handoff_new_ok BOOLEAN");
  await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS handoff_pick_lat NUMERIC(9,6)");
  await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS handoff_pick_lon NUMERIC(9,6)");
  const sRes = await pool.query("SELECT recolector_id, handoff_state, handoff_recolector_id, handoff_new_ok, handoff_pick_lat, handoff_pick_lon FROM solicitudes WHERE id=$1", [sid]);
  const s = sRes.rows[0] || null;
  if (!s || Number(s.recolector_id) !== recoId) { res.status(403).json({ error: "no_owner" }); return; }
  if (String(s.handoff_state||'') !== 'en_intercambio') { res.status(422).json({ error: "no_intercambio" }); return; }
  await pool.query("UPDATE solicitudes SET handoff_old_ok=true WHERE id=$1", [sid]);
  const okNew = Boolean(s.handoff_new_ok);
  const okOld = true;
  if (okOld && okNew) {
    const r1 = await pool.query("SELECT lat, lon FROM recolectores WHERE id=$1", [Number(s.recolector_id)]);
    const r2 = await pool.query("SELECT lat, lon FROM recolectores WHERE id=$1", [Number(s.handoff_recolector_id)]);
    const a = r1.rows[0] || null;
    const b = r2.rows[0] || null;
    const aLat = a?.lat!=null ? Number(a.lat) : NaN;
    const aLon = a?.lon!=null ? Number(a.lon) : NaN;
    const bLat = b?.lat!=null ? Number(b.lat) : NaN;
    const bLon = b?.lon!=null ? Number(b.lon) : NaN;
    const d = (!isNaN(aLat) && !isNaN(aLon) && !isNaN(bLat) && !isNaN(bLon)) ? haversineKm(aLat, aLon, bLat, bLon) : Infinity;
    if (d <= 0.05) {
      await pool.query("UPDATE solicitudes SET recolector_id=$2, handoff_state='completado' WHERE id=$1", [sid, Number(s.handoff_recolector_id)]);
      await pool.query("UPDATE solicitudes SET estado='rumbo_a_empresa' WHERE id=$1", [sid]);
      try {
        const hooks: any = (global as any).__viajeSimHooks;
        if (hooks && typeof hooks.reanudar === 'function') { await hooks.reanudar(sid); }
      } catch {}
      try {
        const hhooks: any = (global as any).__handoffSimHooks;
        if (hhooks && typeof hhooks.detener === 'function') { await hhooks.detener(sid); }
      } catch {}
      const subs: any = (global as any).__notifSubs || ((global as any).__notifSubs = {});
      const notify = async (destRole: string, destId: number, tipo: string, mensaje: string) => {
        const safeId = (destId!=null && !Number.isNaN(destId) && destId>0) ? destId : null;
        if (!safeId) return;
        const payload = `event: notif\ndata: ${JSON.stringify({ solicitud_id: sid, actor_destino: destRole, destino_id: Number(destId), tipo, mensaje })}\n\n`;
        try { await pool.query("INSERT INTO notificaciones(solicitud_id, actor_destino, destino_id, tipo, mensaje) VALUES($1,$2,$3,$4,$5)", [sid, destRole, safeId, tipo, mensaje]); } catch {}
        const k = `${destRole}:${destId}`;
        const arr = subs[k] || [];
        for (const r of arr) { try { r.write(payload); } catch {} }
      };
      await notify('recolector', Number(s.recolector_id), 'handoff_completado', 'Handoff completado, pedido entregado al nuevo recolector');
      await notify('recolector', Number(s.handoff_recolector_id), 'handoff_completado', 'Handoff completado, continúa hacia la empresa');
      res.json({ ok: true, handoff_state: 'completado' });
      return;
    }
    res.status(422).json({ error: "distancia_insuficiente" });
    return;
  }
  res.json({ ok: true, handoff_old_ok: true });
}));

recolectorRouter.post("/:sid/handoff/confirm_new", asyncHandler(async (req: Request, res: Response) => {
  const sid = Number(req.params.sid);
  const recoId = Number(req.body?.recolector_id);
  if (!sid || Number.isNaN(recoId)) { res.status(400).json({ error: "invalid_body" }); return; }
  await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS handoff_new_ok BOOLEAN");
  await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS handoff_pick_lat NUMERIC(9,6)");
  await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS handoff_pick_lon NUMERIC(9,6)");
  await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS handoff_recolector_id INTEGER");
  const sRes = await pool.query("SELECT usuario_id, empresa_id, recolector_id, handoff_state, handoff_recolector_id, handoff_old_ok, handoff_pick_lat, handoff_pick_lon FROM solicitudes WHERE id=$1", [sid]);
  const s = sRes.rows[0] || null;
  if (!s || Number(s.handoff_recolector_id) !== recoId) { res.status(403).json({ error: "no_new_owner" }); return; }
  if (String(s.handoff_state||'') !== 'en_intercambio') { res.status(422).json({ error: "no_intercambio" }); return; }
  await pool.query("UPDATE solicitudes SET handoff_new_ok=true WHERE id=$1", [sid]);
  const okOld = Boolean(s.handoff_old_ok);
  const okNew = true;
  if (okOld && okNew) {
    const r1 = await pool.query("SELECT lat, lon FROM recolectores WHERE id=$1", [Number(s.recolector_id)]);
    const r2 = await pool.query("SELECT lat, lon FROM recolectores WHERE id=$1", [Number(s.handoff_recolector_id)]);
    const a = r1.rows[0] || null;
    const b = r2.rows[0] || null;
    const aLat = a?.lat!=null ? Number(a.lat) : NaN;
    const aLon = a?.lon!=null ? Number(a.lon) : NaN;
    const bLat = b?.lat!=null ? Number(b.lat) : NaN;
    const bLon = b?.lon!=null ? Number(b.lon) : NaN;
    const d = (!isNaN(aLat) && !isNaN(aLon) && !isNaN(bLat) && !isNaN(bLon)) ? haversineKm(aLat, aLon, bLat, bLon) : Infinity;
    if (d <= 0.05) {
      await pool.query("UPDATE solicitudes SET recolector_id=$2, handoff_state='completado' WHERE id=$1", [sid, Number(s.handoff_recolector_id)]);
      await pool.query("UPDATE solicitudes SET estado='rumbo_a_empresa' WHERE id=$1", [sid]);
      try {
        const hooks: any = (global as any).__viajeSimHooks;
        if (hooks && typeof hooks.reanudar === 'function') { await hooks.reanudar(sid); }
      } catch {}
      try {
        const hhooks: any = (global as any).__handoffSimHooks;
        if (hhooks && typeof hhooks.detener === 'function') { await hhooks.detener(sid); }
      } catch {}
      const subs: any = (global as any).__notifSubs || ((global as any).__notifSubs = {});
      const notify = async (destRole: string, destId: number, tipo: string, mensaje: string) => {
        const safeId = (destId!=null && !Number.isNaN(destId) && destId>0) ? destId : null;
        if (!safeId) return;
        const payload = `event: notif\ndata: ${JSON.stringify({ solicitud_id: sid, actor_destino: destRole, destino_id: Number(destId), tipo, mensaje })}\n\n`;
        try { await pool.query("INSERT INTO notificaciones(solicitud_id, actor_destino, destino_id, tipo, mensaje) VALUES($1,$2,$3,$4,$5)", [sid, destRole, safeId, tipo, mensaje]); } catch {}
        const k = `${destRole}:${destId}`;
        const arr = subs[k] || [];
        for (const r of arr) { try { r.write(payload); } catch {} }
      };
      await notify('recolector', Number(s.recolector_id), 'handoff_completado', 'Handoff completado, pedido entregado al nuevo recolector');
      await notify('recolector', Number(s.handoff_recolector_id), 'handoff_completado', 'Handoff completado, continúa hacia la empresa');
      res.json({ ok: true, handoff_state: 'completado' });
      return;
    }
    res.status(422).json({ error: "distancia_insuficiente" });
    return;
  }
  res.json({ ok: true, handoff_new_ok: true });
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
  const viewerIdRaw = (req.query.viewer_id as any);
  const viewerId = viewerIdRaw!=null ? Number(viewerIdRaw) : null;
  const pickRecoIdRes = await pool.query("SELECT handoff_recolector_id FROM solicitudes WHERE id=$1", [sid]);
  const handRecoId = pickRecoIdRes.rows[0]?.handoff_recolector_id!=null ? Number(pickRecoIdRes.rows[0].handoff_recolector_id) : null;
  const currentRecoId = Number((s as any).recolector_id);
  const hadHandoff = handRecoId!=null && !Number.isNaN(handRecoId);
  let puedeUsuario = false;
  let puedeEmpresa = false;
  if (viewerId!=null && !Number.isNaN(viewerId)) {
    if (hadHandoff) {
      // Solo el segundo recolector (actual) puede calificar a la empresa
      puedeEmpresa = viewerId === currentRecoId;
      // El primero (no actual) solo puede calificar al usuario
      puedeUsuario = viewerId !== currentRecoId;
    } else {
      // Sin handoff: único recolector puede calificar a ambos
      puedeEmpresa = viewerId === currentRecoId;
      puedeUsuario = viewerId === currentRecoId;
    }
  }
  let ya_emp_por_reco = false;
  let ya_usr_por_reco = false;
  try {
    if (viewerId!=null && !Number.isNaN(viewerId)) {
      const chkE = await pool.query("SELECT 1 FROM resenas_empresas_por_recolector WHERE empresa_id=$1 AND recolector_id=$2 AND transaccion_id=$3 LIMIT 1", [Number(s.empresa_id), viewerId, Number(tx.id)]);
      ya_emp_por_reco = (chkE.rowCount||0) > 0;
      const chkU = await pool.query("SELECT 1 FROM resenas_usuarios_por_recolector WHERE usuario_id=$1 AND recolector_id=$2 AND transaccion_id=$3 LIMIT 1", [Number(s.usuario_id), viewerId, Number(tx.id)]);
      ya_usr_por_reco = (chkU.rowCount||0) > 0;
    }
  } catch {}
  res.json({
    solicitud_id: sid,
    materiales: pesajes,
    total_kg: totalKg,
    clasificacion: s.clasificacion_distancia,
    dist_recolector_usuario_km: distRU,
    dist_usuario_empresa_km: distUE,
    usuario_id: Number(s.usuario_id),
    empresa_id: Number(s.empresa_id),
    transaccion_id: Number(tx.id),
    puede_calificar_usuario: puedeUsuario,
    puede_calificar_empresa: puedeEmpresa,
    ya_resena_usuario_por_recolector: ya_usr_por_reco,
    ya_resena_empresa_por_recolector: ya_emp_por_reco
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
