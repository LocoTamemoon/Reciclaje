import { Router, Request, Response, NextFunction } from "express";
import { crearNuevaSolicitud, cancelarSolicitudPorUsuario, republicarSolicitudPorUsuario } from "../services/solicitudesService";
import { obtenerSolicitud } from "../repositories/solicitudesRepo";
import { asyncHandler } from "../middleware/asyncHandler";
import { pool } from "../db/pool";

export const solicitudesRouter = Router();

solicitudesRouter.post("/", asyncHandler(async (req: Request, res: Response) => {
  const { usuario_id, empresa_id, items, delivery, delivery_consent, delivery_terms_version, delivery_use_current } = req.body;
  const normalizedItems = Array.isArray(items) ? items.map((it: any)=>({ material_id: Number(it.material_id), kg: Number(it.kg) })) : [];
  const s = await crearNuevaSolicitud(Number(usuario_id), Number(empresa_id), normalizedItems, Boolean(delivery), Boolean(delivery_consent), delivery_terms_version ? String(delivery_terms_version) : null, Boolean(delivery_use_current));
  res.json(s);
}));

solicitudesRouter.post("/:sid/cancelar", asyncHandler(async (req: Request, res: Response) => {
  const sid = Number(req.params.sid);
  const { usuario_id } = req.body;
  const s = await cancelarSolicitudPorUsuario(Number(usuario_id), sid);
  res.json(s);
}));

solicitudesRouter.post("/:sid/republish", asyncHandler(async (req: Request, res: Response) => {
  const sid = Number(req.params.sid);
  const { usuario_id } = req.body;
  const s = await republicarSolicitudPorUsuario(Number(usuario_id), sid);
  res.json(s);
}));

solicitudesRouter.get("/:sid", (req: Request, res: Response, next: NextFunction) => {
  (async () => {
    const sidStr = String(req.params.sid||'');
    const sid = Number(sidStr);
    if (Number.isNaN(sid)) { next(); return; }
    const s = await obtenerSolicitud(sid);
    if (!s) { res.status(404).json({ error: "not_found" }); return; }
    res.json(s);
  })().catch(next);
});

solicitudesRouter.post("/:sid/etapas", asyncHandler(async (req: Request, res: Response) => {
  const sid = Number(req.params.sid);
  const { etapa, actor, actor_id } = req.body;
  console.log("etapas_in", { sid, etapa, actor, actor_id });
  const s = await obtenerSolicitud(sid);
  if (!s) { res.status(404).json({ error: "not_found" }); return; }
  const e = String(etapa||'');
  if (!e) { res.status(400).json({ error: "etapa_requerida" }); return; }
  const act = String(actor||'');
  const aid = Number(actor_id);
  if (!act || !aid) { res.status(400).json({ error: "actor_requerido" }); return; }
  let nextEstado: string | null = null;
  if (e === 'usuario_confirmo_llegada' && act==='usuario' && aid===Number(s.usuario_id)) {
    nextEstado = 'usuario_confirmo_llegada';
    await pool.query("UPDATE solicitudes SET usuario_llegada_ok=true WHERE id=$1", [sid]);
  }
  if (e === 'recolector_confirmo_recojo' && act==='recolector' && aid===Number(s.recolector_id)) {
    nextEstado = 'recolector_confirmo_recojo';
    await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS pickup_recolector_id INTEGER");
    await pool.query("UPDATE solicitudes SET recolector_recojo_ok=true, pickup_recolector_id=$2 WHERE id=$1", [sid, Number(s.recolector_id)]);
  }
  if (e === 'entregado_empresa' && act==='recolector' && aid===Number(s.recolector_id)) nextEstado = 'entregado_empresa';
  if (e === 'empresa_confirmo_recepcion' && act==='empresa' && aid===Number(s.empresa_id)) nextEstado = 'empresa_confirmo_recepcion';
  if (!nextEstado) { res.status(422).json({ error: "etapa_invalida" }); return; }
  await pool.query("UPDATE solicitudes SET estado=$2 WHERE id=$1", [sid, nextEstado]);
  console.log("estado_update", { sid, estado: nextEstado });
  const notify = async (destRole: string, destId: number, tipo: string, mensaje: string) => {
    const safeId = (destId!=null && !Number.isNaN(destId) && destId>0) ? destId : null;
    if (!safeId) return;
    await pool.query("INSERT INTO notificaciones(solicitud_id, actor_destino, destino_id, tipo, mensaje) VALUES($1,$2,$3,$4,$5)", [sid, destRole, safeId, tipo, mensaje]);
    const payload = `event: notif\ndata: ${JSON.stringify({ solicitud_id: sid, actor_destino: destRole, destino_id: destId, tipo, mensaje })}\n\n`;
    const k = `${destRole}:${destId}`;
    const subs: any = (global as any).__notifSubs || {};
    const arr = subs[k] || [];
    for (const r of arr) { try { r.write(payload); } catch {} }
    console.log("etapas_notif_emit", { sid, destRole, destId, tipo, listeners: arr.length });
  };
  if (nextEstado==='usuario_confirmo_llegada') {
    if (s.recolector_id) await notify('recolector', Number(s.recolector_id), 'usuario_confirmo_llegada', 'Usuario confirmó que llegó');
  }
  if (nextEstado==='recolector_confirmo_recojo') {
    await notify('usuario', Number(s.usuario_id), 'recolector_confirmo_recojo', 'Recolector confirmó recojo');
  }
  if (nextEstado==='entregado_empresa') {
    if (s.empresa_id) await notify('empresa', Number(s.empresa_id), 'entregado', 'Pedido entregado por recolector');
    await notify('usuario', Number(s.usuario_id), 'entregado', 'Pedido entregado en la empresa');
  }
  if (nextEstado==='empresa_confirmo_recepcion') {
    if (s.recolector_id) await notify('recolector', Number(s.recolector_id), 'empresa_confirmo', 'Empresa confirmó recepción');
    await notify('usuario', Number(s.usuario_id), 'empresa_confirmo', 'Empresa confirmó recepción');
  }
  const flags = await pool.query("SELECT usuario_llegada_ok, recolector_recojo_ok FROM solicitudes WHERE id=$1", [sid]);
  const f = flags.rows[0] || { usuario_llegada_ok:false, recolector_recojo_ok:false };
  console.log("etapas_flags", { sid, usuario_llegada_ok: f.usuario_llegada_ok, recolector_recojo_ok: f.recolector_recojo_ok });
  if (f.usuario_llegada_ok && f.recolector_recojo_ok) {
    await pool.query("UPDATE solicitudes SET estado='rumbo_a_empresa' WHERE id=$1", [sid]);
    console.log("estado_update", { sid, estado: 'rumbo_a_empresa' });
  }
  res.json({ ok: true, estado: nextEstado });
}));

solicitudesRouter.get("/:sid/notificaciones/stream", asyncHandler(async (req: Request, res: Response) => {
  const sid = Number(req.params.sid);
  const role = String(req.query.role||'');
  const id = Number(req.query.id);
  if (!role || !id) { res.status(400).json({ error: "role_id_requeridos" }); return; }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const k = `${role}:${id}`;
  const subs: any = (global as any).__notifSubs || ((global as any).__notifSubs = {});
  (subs[k] ||= []).push(res);
  req.on('close', ()=>{
    const arr = subs[k] || [];
    (subs[k] = arr.filter((r: any)=> r !== res));
  });
}));

solicitudesRouter.get("/:sid/notificaciones", asyncHandler(async (req: Request, res: Response) => {
  const sid = Number(req.params.sid);
  const role = String(req.query.role||'');
  const id = Number(req.query.id);
  const r = await pool.query("SELECT * FROM notificaciones WHERE solicitud_id=$1 AND actor_destino=COALESCE($2, actor_destino) AND destino_id=COALESCE($3, destino_id) ORDER BY creado_en DESC LIMIT 100", [sid, role||null, id||null]);
  res.json(r.rows);
}));

solicitudesRouter.post("/notificaciones/:nid/leido", asyncHandler(async (req: Request, res: Response) => {
  const nid = Number(req.params.nid);
  const r = await pool.query("UPDATE notificaciones SET leido=true WHERE id=$1 RETURNING *", [nid]);
  res.json(r.rows[0] || null);
}));

solicitudesRouter.get("/notificaciones/stream", asyncHandler(async (req: Request, res: Response) => {
  const role = String(req.query.role||'');
  const id = Number(req.query.id);
  if (!role || !id) { res.status(400).json({ error: "role_id_requeridos" }); return; }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const k = `${role}:${id}`;
  const subs: any = (global as any).__notifSubs || ((global as any).__notifSubs = {});
  (subs[k] ||= []).push(res);
  console.log("notif_stream_subscribe", { role, id });
  const ping = setInterval(()=>{ try{ res.write(': ping\n\n'); }catch{} }, 15000);
  req.on('close', ()=>{
    const arr = subs[k] || [];
    (subs[k] = arr.filter((r: any)=> r !== res));
    try{ clearInterval(ping); }catch{}
    console.log("notif_stream_unsubscribe", { role, id });
  });
}));

solicitudesRouter.get("/notificaciones", asyncHandler(async (req: Request, res: Response) => {
  const roleRaw = req.query.role as any;
  const idRaw = req.query.id as any;
  const statusRaw = req.query.status as any;
  const role = roleRaw ? String(roleRaw) : null;
  const idNum = idRaw != null ? Number(idRaw) : null;
  const id = idNum != null && !Number.isNaN(idNum) ? idNum : null;
  const where: string[] = [];
  const params: any[] = [];
  if (role) { where.push(`actor_destino=$${params.length+1}`); params.push(role); }
  if (id != null) { where.push(`destino_id=$${params.length+1}`); params.push(id); }
  if (statusRaw) {
    const s = String(statusRaw).toLowerCase();
    if (s === 'pending') { where.push(`leido=false`); }
    else if (s === 'past') { where.push(`leido=true`); }
  }
  const sql = `SELECT * FROM notificaciones ${where.length? ('WHERE ' + where.join(' AND ')) : ''} ORDER BY creado_en DESC LIMIT 200`;
  const r = await pool.query(sql, params);
  console.log("notif_list", { role, id, rows: r.rows.length });
  res.json(r.rows);
}));
