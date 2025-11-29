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

const viajeStreams: Map<number, Set<any>> = new Map();
const viajeSimTimers: Map<number, any> = new Map();
const viajeSimProgress: Map<number, number> = new Map();
const viajeSimPoints: Map<number, { lat: number; lon: number }[]> = new Map();

app.get("/api/viajes/:sid/stream", (req, res) => {
  const sid = Number(req.params.sid);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const set = viajeStreams.get(sid) || new Set();
  if (!viajeStreams.has(sid)) viajeStreams.set(sid, set);
  set.add(res);
  req.on("close", () => {
    const s = viajeStreams.get(sid);
    if (s) s.delete(res);
  });
});

app.post("/api/viajes/:sid/posicion", (req, res) => {
  const sid = Number(req.params.sid);
  const { lat, lon, phase, i } = req.body || {};
  const payload = JSON.stringify({ sid, lat: lat!=null?Number(lat):null, lon: lon!=null?Number(lon):null, phase: phase||null, i: i!=null?Number(i):null, ts: Date.now() });
  const set = viajeStreams.get(sid);
  if (set) {
    set.forEach((r) => {
      try { r.write(`data: ${payload}\n\n`); } catch {}
    });
  }
  res.json({ ok: true });
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
  if (set) {
    const payload = JSON.stringify({ sid, lat, lon, i, ts: Date.now() });
    set.forEach((r) => { try { r.write(`data: ${payload}\n\n`); } catch {} });
  }
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
    if (prevTimer) { clearInterval(prevTimer); viajeSimTimers.delete(sid); }
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
    res.json({ ok: true, points: (pts||[]).length });
  } catch (e) {
    res.status(500).json({ error: "sim_start_failed" });
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
