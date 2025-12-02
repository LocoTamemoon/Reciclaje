import express from "express";
import path from "path";
import { env } from "./config/env";
import { empresasRouter } from "./routes/empresas";
import { solicitudesRouter } from "./routes/solicitudes";
import { resenasRouter } from "./routes/resenas";
import { usuariosRouter } from "./routes/usuarios";
import { errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./routes/auth";
import { transaccionesRouter } from "./routes/transacciones";
import { materialesRouter } from "./routes/materiales";
import { recolectorRouter } from "./routes/recolector";
import { pool } from "./db/pool";
import { updateDeliveryProximityAndState } from "./services/solicitudesService";

async function ensureDistritosSchema() {
  try {
    await pool.query("CREATE TABLE IF NOT EXISTS distritos (id_distrito SERIAL PRIMARY KEY, nombre TEXT NOT NULL UNIQUE)");
    await pool.query("ALTER TABLE recolectores ADD COLUMN IF NOT EXISTS id_distrito INTEGER");
    try {
      const c = await pool.query("SELECT 1 FROM information_schema.table_constraints WHERE table_name='recolectores' AND constraint_name='recolectores_id_distrito_fkey' LIMIT 1");
      if (!c.rows[0]) {
        await pool.query("ALTER TABLE recolectores ADD CONSTRAINT recolectores_id_distrito_fkey FOREIGN KEY (id_distrito) REFERENCES distritos(id_distrito)");
      }
    } catch {}
    try {
      const r = await pool.query("SELECT COUNT(*)::int AS c FROM distritos");
      const c = Number((r.rows[0] || {}).c || 0);
      if (c === 0) {
        const names = [
          'Ate','Barranco','Breña','Carabayllo','Chorrillos','Comas','El Agustino','Independencia','Jesús María','La Molina','La Victoria','Lima','Lince','Los Olivos','Magdalena del Mar','Miraflores','Pachacámac','Pueblo Libre','Puente Piedra','Rímac','San Borja','San Isidro','San Juan de Lurigancho','San Juan de Miraflores','San Luis','San Martín de Porres','San Miguel','Santa Anita','Santiago de Surco','Surquillo','Villa El Salvador','Villa María del Triunfo','Callao','Bellavista','Carmen de la Legua-Reynoso','La Perla','La Punta'
        ];
        for (const n of names) {
          await pool.query("INSERT INTO distritos(nombre) VALUES($1) ON CONFLICT(nombre) DO NOTHING", [n]);
        }
      }
    } catch {}
  } catch {}
}

const app = express();
app.use(express.json());
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.json({ name: "reciclaje-backend", status: "ok", endpoints: ["/api/empresas", "/api/solicitudes", "/api/resenas", "/api/usuarios"] });
});

app.use("/api/empresas", empresasRouter);
app.use("/api/solicitudes", solicitudesRouter);
app.use("/api/resenas", resenasRouter);
app.use("/api/usuarios", usuariosRouter);
app.use("/api/auth", authRouter);
app.use("/api/transacciones", transaccionesRouter);
app.use("/api/materiales", materialesRouter);
app.use("/api/recolector", recolectorRouter);

ensureDistritosSchema();

const viajeStreams: Map<number, Set<any>> = new Map();
const viajeSimTimers: Map<number, any> = new Map();
const viajeSimProgress: Map<number, number> = new Map();
const viajeSimPoints: Map<number, { lat: number; lon: number }[]> = new Map();

app.get("/api/viajes/:sid/stream", (req, res) => {
  const sid = Number(req.params.sid);
  console.log("viajes_stream_subscribe", { sid });
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const set = viajeStreams.get(sid) || new Set();
  if (!viajeStreams.has(sid)) viajeStreams.set(sid, set);
  set.add(res);
  req.on("close", () => {
    console.log("viajes_stream_unsubscribe", { sid });
    const s = viajeStreams.get(sid);
    if (s) s.delete(res);
  });
});

app.post("/api/viajes/:sid/posicion", (req, res) => {
  const sid = Number(req.params.sid);
  const { lat, lon, phase, i } = req.body || {};
  console.log("viajes_posicion_in", { sid, lat, lon, phase, i });
  const set = viajeStreams.get(sid);
  try {
    const latNum = lat!=null?Number(lat):NaN;
    const lonNum = lon!=null?Number(lon):NaN;
    if (!Number.isNaN(latNum) && !Number.isNaN(lonNum)) {
      (async ()=>{
        const r = await updateDeliveryProximityAndState(sid, latNum, lonNum);
        const shouldPause = Boolean(r.pauseAtUser);
        if (shouldPause) { const t = viajeSimTimers.get(sid); if (t) { try { clearInterval(t); } catch {} viajeSimTimers.delete(sid); } }
        const allowEmit = !shouldPause;
        if (allowEmit && set) {
          const payload = JSON.stringify({ sid, lat: latNum, lon: lonNum, phase: phase||null, i: i!=null?Number(i):null, ts: Date.now() });
          set.forEach((rr) => { try { rr.write(`data: ${payload}\n\n`); } catch {} });
          console.log("viajes_posicion_emit", { sid, listeners: set?.size||0, pauseAtUser: shouldPause });
        } else {
          console.log("viajes_posicion_block", { sid, pauseAtUser: shouldPause });
        }
        res.json({ ok: true });
      })().catch((e)=>{ console.error("viajes_posicion_dist_fail", { sid, error: String(e) }); res.json({ ok: true }); });
    } else {
      res.json({ ok: true });
    }
  } catch {
    res.json({ ok: true });
  }
});

app.post("/api/viajes/:sid/coords", (req, res) => {
  const sid = Number(req.params.sid);
  const coordsIn = Array.isArray((req.body||{}).coords) ? (req.body||{}).coords : [];
  const coords = coordsIn.map((c: any)=>({ lat: Number(c.lat), lon: Number(c.lon) })).filter((p: any)=> !isNaN(p.lat) && !isNaN(p.lon));
  viajeSimPoints.set(sid, coords);
  res.json({ ok: true, points: coords.length });
});

app.get("/api/viajes/:sid/coords", (req, res) => {
  const sid = Number(req.params.sid);
  const pts = viajeSimPoints.get(sid) || [];
  res.json({ points: pts });
});

async function obtenerPuntosSimulacion(sid: number): Promise<{ lat: number; lon: number }[]> {
  const sRes = await pool.query("SELECT * FROM solicitudes WHERE id=$1", [sid]);
  const s = sRes.rows[0];
  if (!s) return [];
  const uRes = await pool.query("SELECT * FROM usuarios WHERE id=$1", [Number(s.usuario_id)]);
  const usuario = uRes.rows[0] || null;
  const eRes = await pool.query("SELECT * FROM empresas WHERE id=$1", [Number(s.empresa_id)]);
  const empresa = eRes.rows[0] || null;
  let rLat = s.recolector_accept_lat != null ? Number(s.recolector_accept_lat) : null;
  let rLon = s.recolector_accept_lon != null ? Number(s.recolector_accept_lon) : null;
  if (rLat == null || rLon == null) {
    const rRes = await pool.query("SELECT lat, lon FROM recolectores WHERE id=$1", [Number(s.recolector_id)]);
    const rrow = rRes.rows[0] || null;
    rLat = rrow?.lat != null ? Number(rrow.lat) : null;
    rLon = rrow?.lon != null ? Number(rrow.lon) : null;
  }
  const useCur = Boolean(s.usuario_pick_actual);
  const uCurLat = usuario?.current_lat != null ? Number(usuario.current_lat) : null;
  const uCurLon = usuario?.current_lon != null ? Number(usuario.current_lon) : null;
  const uHomeLat = usuario?.home_lat != null ? Number(usuario.home_lat) : (usuario?.lat != null ? Number(usuario.lat) : null);
  const uHomeLon = usuario?.home_lon != null ? Number(usuario.home_lon) : (usuario?.lon != null ? Number(usuario.lon) : null);
  const uLat = useCur && uCurLat != null ? uCurLat : uHomeLat;
  const uLon = useCur && uCurLon != null ? uCurLon : uHomeLon;
  const eLat = empresa?.lat != null ? Number(empresa.lat) : null;
  const eLon = empresa?.lon != null ? Number(empresa.lon) : null;
  const pts: { lat: number; lon: number }[] = [];
  function interp(aLat: number, aLon: number, bLat: number, bLon: number, steps: number) {
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      pts.push({ lat: aLat + (bLat - aLat) * t, lon: aLon + (bLon - aLon) * t });
    }
  }
  if (rLat != null && rLon != null && uLat != null && uLon != null) interp(rLat, rLon, uLat, uLon, 300);
  if (uLat != null && uLon != null && eLat != null && eLon != null) interp(uLat, uLon, eLat, eLon, 300);
  if (eLat != null && eLon != null) pts.push({ lat: eLat, lon: eLon });
  return pts;
}

function emitirSSE(sid: number, lat: number, lon: number, i: number) {
  const set = viajeStreams.get(sid);
  (async ()=>{
    const r = await updateDeliveryProximityAndState(sid, Number(lat), Number(lon));
    const shouldPause = Boolean(r.pauseAtUser);
    if (shouldPause) { const t = viajeSimTimers.get(sid); if (t) { try { clearInterval(t); } catch {} viajeSimTimers.delete(sid); } }
    const allowEmit = !shouldPause;
    if (allowEmit && set) {
      const payload = JSON.stringify({ sid, lat, lon, i, ts: Date.now() });
      set.forEach((rr) => { try { rr.write(`data: ${payload}\n\n`); } catch {} });
      console.log("emitirSSE_emit", { sid, i, pauseAtUser: shouldPause });
    } else {
      console.log("emitirSSE_block", { sid, i, pauseAtUser: shouldPause });
    }
  })().catch((e)=>{ console.error("emitirSSE_dist_fail", { sid, error: String(e) }); });
}

app.post("/api/viajes/:sid/iniciar", async (req, res) => {
  const sid = Number(req.params.sid);
  try {
    let pts = viajeSimPoints.get(sid);
    if (!pts || pts.length < 2) {
      pts = await obtenerPuntosSimulacion(sid);
      viajeSimPoints.set(sid, pts);
    }
    const prevTimer = viajeSimTimers.get(sid);
    if (prevTimer) { res.json({ ok: true, running: true, points: (pts||[]).length }); return; }
    let i = 0;
    viajeSimProgress.set(sid, 0);
    const timer = setInterval(() => {
      const arr = viajeSimPoints.get(sid) || [];
      if (i >= arr.length) { clearInterval(timer); viajeSimTimers.delete(sid); return; }
      const p = arr[i];
      emitirSSE(sid, p.lat, p.lon, i);
      i++;
      viajeSimProgress.set(sid, i);
    }, 400);
    viajeSimTimers.set(sid, timer);
    console.log("viajes_iniciar", { sid, points: (pts||[]).length });
    res.json({ ok: true, points: (pts||[]).length });
  } catch (e) {
    console.error("viajes_iniciar_fail", { sid, error: String(e) });
    res.status(500).json({ error: "sim_start_failed" });
  }
});

app.post("/api/viajes/:sid/pausar", (req, res) => {
  const sid = Number(req.params.sid);
  const t = viajeSimTimers.get(sid);
  if (t) { try { clearInterval(t); } catch {} viajeSimTimers.delete(sid); }
  const prog = viajeSimProgress.get(sid) || 0;
  console.log("viajes_pausar", { sid, progress: prog });
  res.json({ ok: true, paused: true, progress: prog });
});

app.post("/api/viajes/:sid/reanudar", (req, res) => {
  const sid = Number(req.params.sid);
  try {
    const arr = viajeSimPoints.get(sid) || [];
    if (!arr || arr.length < 2) { res.status(400).json({ error: "no_points" }); return; }
    if (viajeSimTimers.get(sid)) { res.json({ ok: true, running: true }); return; }
    let i = viajeSimProgress.get(sid) || 0;
    const timer = setInterval(() => {
      const pts = viajeSimPoints.get(sid) || [];
      if (i >= pts.length) { clearInterval(timer); viajeSimTimers.delete(sid); return; }
      const p = pts[i];
      emitirSSE(sid, p.lat, p.lon, i);
      i++;
      viajeSimProgress.set(sid, i);
    }, 400);
    viajeSimTimers.set(sid, timer);
    console.log("viajes_reanudar", { sid, from: viajeSimProgress.get(sid) || 0 });
    res.json({ ok: true, running: true, from: viajeSimProgress.get(sid) || 0 });
  } catch (e) {
    res.status(500).json({ error: "resume_failed" });
  }
});

app.post("/api/viajes/:sid/finalizar", (req, res) => {
  const sid = Number(req.params.sid);
  const t = viajeSimTimers.get(sid);
  if (t) { try { clearInterval(t); } catch {} viajeSimTimers.delete(sid); }
  viajeSimProgress.delete(sid);
  res.json({ ok: true });
});

app.post("/api/viajes/:sid/cancelar", async (req, res) => {
  const sid = Number(req.params.sid);
  try {
    const t = viajeSimTimers.get(sid);
    if (t) { try { clearInterval(t); } catch {} viajeSimTimers.delete(sid); }
    viajeSimProgress.delete(sid);
    await pool.query("UPDATE solicitudes SET estado='cancelada', estado_publicacion='cancelada' WHERE id=$1", [sid]);
    res.json({ ok: true, estado: "cancelada" });
  } catch (e) {
    res.status(500).json({ error: "cancel_failed" });
  }
});

app.use((req, res) => {
  res.status(404).sendFile(path.resolve("public", "404.html"));
});

app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`Servidor en puerto ${env.port}`);
});
