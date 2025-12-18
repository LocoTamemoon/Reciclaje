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
import { adminRouter } from "./routes/admin";
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

async function ensureHandoffSchema() {
  try {
    await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS handoff_state TEXT");
    await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS handoff_pick_lat NUMERIC(9,6)");
    await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS handoff_pick_lon NUMERIC(9,6)");
    await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS handoff_expires_at TIMESTAMPTZ");
    await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS handoff_recolector_id INTEGER");
    await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS handoff_old_ok BOOLEAN DEFAULT false");
    await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS handoff_new_ok BOOLEAN DEFAULT false");
    await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS handoff_cur_lat NUMERIC(9,6)");
    await pool.query("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS handoff_cur_lon NUMERIC(9,6)");
    try {
      const c = await pool.query("SELECT 1 FROM information_schema.table_constraints WHERE table_name='solicitudes' AND constraint_name='solicitudes_handoff_recolector_id_fkey' LIMIT 1");
      if (!c.rows[0]) {
        await pool.query("ALTER TABLE solicitudes ADD CONSTRAINT solicitudes_handoff_recolector_id_fkey FOREIGN KEY (handoff_recolector_id) REFERENCES recolectores(id)");
      }
    } catch {}
  } catch {}
}

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
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
app.use("/api/admin", adminRouter);

ensureDistritosSchema();
ensureHandoffSchema();
async function ensureActivosSchema(){
  try{
    await pool.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS estado BOOLEAN DEFAULT true");
    await pool.query("ALTER TABLE empresas ADD COLUMN IF NOT EXISTS estado BOOLEAN DEFAULT true");
    await pool.query("ALTER TABLE resenas_empresas ADD COLUMN IF NOT EXISTS estado BOOLEAN DEFAULT true");
    await pool.query("ALTER TABLE resenas_empresas_por_recolector ADD COLUMN IF NOT EXISTS estado BOOLEAN DEFAULT true");
    await pool.query("ALTER TABLE resenas_usuarios ADD COLUMN IF NOT EXISTS estado BOOLEAN DEFAULT true");
    await pool.query("ALTER TABLE resenas_usuarios_por_recolector ADD COLUMN IF NOT EXISTS estado BOOLEAN DEFAULT true");
    await pool.query("ALTER TABLE resenas_recolectores ADD COLUMN IF NOT EXISTS estado BOOLEAN DEFAULT true");
  }catch{}
}
ensureActivosSchema();

async function ensureAdminSchema() {
  try {
    await pool.query("CREATE TABLE IF NOT EXISTS admins (id SERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, nombre TEXT, apellidos TEXT, foto_perfil TEXT, estado BOOLEAN DEFAULT true, creado_en TIMESTAMPTZ DEFAULT NOW())");
    const email = process.env.ADMIN_EMAIL;
    const pass = process.env.ADMIN_PASSWORD;
    if (email && pass) {
      const bcrypt = require("bcryptjs");
      const hash = await bcrypt.hash(String(pass), 10);
      await pool.query("INSERT INTO admins(email, password_hash, nombre, estado) VALUES($1,$2,$3,true) ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash", [String(email), String(hash), "Admin"]);
    }
  } catch {}
}

ensureAdminSchema();
async function ensureUsuariosDniSchema(){
  try {
    await pool.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS dni VARCHAR(7)");
    try {
      const c = await pool.query("SELECT 1 FROM information_schema.table_constraints WHERE table_name='usuarios' AND constraint_name='usuarios_dni_unique' LIMIT 1");
      if (!c.rows[0]) {
        await pool.query("ALTER TABLE usuarios ADD CONSTRAINT usuarios_dni_unique UNIQUE (dni)");
      }
    } catch {}
    try {
      const c2 = await pool.query("SELECT 1 FROM information_schema.table_constraints WHERE table_name='usuarios' AND constraint_name='usuarios_dni_chk' LIMIT 1");
      if (!c2.rows[0]) {
        await pool.query("ALTER TABLE usuarios ADD CONSTRAINT usuarios_dni_chk CHECK (dni ~ '^[0-9]{1,7}$')");
      }
    } catch {}
    try {
      await pool.query("UPDATE usuarios SET dni=$2 WHERE id=$1", [2, '7654321']);
    } catch {}
  } catch {}
}
ensureUsuariosDniSchema();
async function ensureEmpresasRucConstraint(){
  try {
    try {
      const c = await pool.query("SELECT 1 FROM information_schema.table_constraints WHERE table_name='empresas' AND constraint_name='empresas_ruc_chk' LIMIT 1");
      if (!c.rows[0]) {
        await pool.query("ALTER TABLE empresas ADD CONSTRAINT empresas_ruc_chk CHECK (ruc ~ '^[0-9]{11}$')");
      }
    } catch {}
  } catch {}
}
ensureEmpresasRucConstraint();

async function ensureUniqueEmailConstraints(){
  try{
    try{
      const c = await pool.query("SELECT 1 FROM information_schema.table_constraints WHERE table_name='usuarios' AND constraint_name='usuarios_email_unique' LIMIT 1");
      if (!c.rows[0]) { await pool.query("ALTER TABLE usuarios ADD CONSTRAINT usuarios_email_unique UNIQUE (email)"); }
    }catch{}
    try{
      const c = await pool.query("SELECT 1 FROM information_schema.table_constraints WHERE table_name='empresas' AND constraint_name='empresas_email_unique' LIMIT 1");
      if (!c.rows[0]) { await pool.query("ALTER TABLE empresas ADD CONSTRAINT empresas_email_unique UNIQUE (email)"); }
    }catch{}
    try{
      const c = await pool.query("SELECT 1 FROM information_schema.table_constraints WHERE table_name='recolectores' AND constraint_name='recolectores_email_unique' LIMIT 1");
      if (!c.rows[0]) { await pool.query("ALTER TABLE recolectores ADD CONSTRAINT recolectores_email_unique UNIQUE (email)"); }
    }catch{}
  }catch{}
}
ensureUniqueEmailConstraints();

const viajeStreams: Map<number, Set<any>> = new Map();
const viajeSimTimers: Map<number, any> = new Map();
const viajeSimProgress: Map<number, number> = new Map();
const viajeSimPoints: Map<number, { lat: number; lon: number }[]> = new Map();
const handoffSimTimers: Map<number, any> = new Map();
const handoffSimProgress: Map<number, number> = new Map();
const handoffSimPoints: Map<number, { lat: number; lon: number }[]> = new Map();
const handoffSpeedMult: Map<number, number> = new Map();

(global as any).__viajeSimHooks = {
  iniciar: async (sid: number) => {
    let pts = viajeSimPoints.get(sid);
    if (!pts || pts.length < 2) {
      pts = await obtenerPuntosSimulacion(sid);
      viajeSimPoints.set(sid, pts);
    }
    const prevTimer = viajeSimTimers.get(sid);
    if (prevTimer) return;
    let i = viajeSimProgress.get(sid) || 0;
    viajeSimProgress.set(sid, i);
    const timer = setInterval(() => {
      const arr = viajeSimPoints.get(sid) || [];
      if (i >= arr.length) { clearInterval(timer); viajeSimTimers.delete(sid); return; }
      const p = arr[i];
      emitirSSE(sid, p.lat, p.lon, i);
      i++;
      viajeSimProgress.set(sid, i);
    }, 400);
    viajeSimTimers.set(sid, timer);
  },
  reanudar: async (sid: number) => {
    const arr = viajeSimPoints.get(sid) || [];
    if (!arr || arr.length < 2) { await (global as any).__viajeSimHooks.iniciar(sid); return; }
    if (viajeSimTimers.get(sid)) return;
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
  }
};

app.get("/api/viajes/:sid/stream", (req, res) => {
  const sid = Number(req.params.sid);
  console.log("viajes_stream_subscribe", { sid });
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const set = viajeStreams.get(sid) || new Set();
  if (!viajeStreams.has(sid)) viajeStreams.set(sid, set);
  set.add(res);
  (async()=>{
    try {
      const r = await pool.query("SELECT handoff_state, handoff_cur_lat, handoff_cur_lon, handoff_pick_lat, handoff_pick_lon, handoff_recolector_id FROM solicitudes WHERE id=$1", [sid]);
      const s = r.rows[0] || null;
      if (s && String(s.handoff_state||'') === 'en_intercambio'){
        let hLat = s.handoff_cur_lat!=null?Number(s.handoff_cur_lat):null;
        let hLon = s.handoff_cur_lon!=null?Number(s.handoff_cur_lon):null;
        if (hLat==null || hLon==null) {
          try {
            const rr = await pool.query("SELECT lat, lon FROM recolectores WHERE id=$1", [Number(s.handoff_recolector_id||0)]);
            const r2 = rr.rows[0] || null;
            hLat = r2?.lat!=null?Number(r2.lat):null;
            hLon = r2?.lon!=null?Number(r2.lon):null;
          } catch {}
        }
        const payload = JSON.stringify({ sid, hand_lat: hLat, hand_lon: hLon, hand_pick_lat: s.handoff_pick_lat!=null?Number(s.handoff_pick_lat):null, hand_pick_lon: s.handoff_pick_lon!=null?Number(s.handoff_pick_lon):null, ts: Date.now() });
        try { res.write(`data: ${payload}\n\n`); } catch {}
      }
    } catch {}
  })();
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
        const pauseUser = Boolean(r.pauseAtUser);
        const pauseHandoff = Boolean((r as any).pauseAtHandoff);
        const shouldPause = pauseUser || pauseHandoff;
        if (shouldPause) { const t = viajeSimTimers.get(sid); if (t) { try { clearInterval(t); } catch {} viajeSimTimers.delete(sid); } }
        const allowEmit = !shouldPause;
        if (allowEmit && set) {
          const payload = JSON.stringify({ sid, lat: latNum, lon: lonNum, phase: phase||null, i: i!=null?Number(i):null, ts: Date.now() });
          set.forEach((rr) => { try { rr.write(`data: ${payload}\n\n`); } catch {} });
          console.log("viajes_posicion_emit", { sid, listeners: set?.size||0, pauseAtUser: pauseUser, pauseAtHandoff: pauseHandoff });
        } else {
          console.log("viajes_posicion_block", { sid, pauseAtUser: pauseUser, pauseAtHandoff: pauseHandoff });
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

app.post("/api/viajes/:sid/handoff/posicion", async (req, res) => {
  const sid = Number(req.params.sid);
  const { lat, lon } = req.body || {};
  const latNum = lat!=null?Number(lat):NaN;
  const lonNum = lon!=null?Number(lon):NaN;
  const set = viajeStreams.get(sid);
  console.log("viajes_handoff_posicion_in", { sid, lat, lon });
  try {
    const sRes = await pool.query("SELECT handoff_state, handoff_pick_lat, handoff_pick_lon FROM solicitudes WHERE id=$1", [sid]);
    const s = sRes.rows[0] || null;
    if (!s || String(s.handoff_state||'') !== 'en_intercambio') { res.status(422).json({ error: "no_handoff" }); return; }
    if (!Number.isNaN(latNum) && !Number.isNaN(lonNum)) {
      try { await pool.query("UPDATE solicitudes SET handoff_cur_lat=$2, handoff_cur_lon=$3 WHERE id=$1", [sid, latNum, lonNum]); } catch {}
      if (set) {
        const payload = JSON.stringify({ sid, hand_lat: latNum, hand_lon: lonNum, hand_pick_lat: s.handoff_pick_lat!=null?Number(s.handoff_pick_lat):null, hand_pick_lon: s.handoff_pick_lon!=null?Number(s.handoff_pick_lon):null, ts: Date.now() });
        set.forEach((rr) => { try { rr.write(`data: ${payload}\n\n`); } catch {} });
        console.log("viajes_handoff_posicion_emit", { sid, listeners: set?.size||0 });
      }
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("viajes_handoff_posicion_fail", { sid, error: String(e) });
    res.status(500).json({ error: "handoff_pos_failed" });
  }
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

function distMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (x: number)=> x*Math.PI/180;
  const R = 6371000;
  const dLat = toRad(bLat-aLat);
  const dLon = toRad(bLon-aLon);
  const aa = Math.sin(dLat/2)**2 + Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(dLon/2)**2;
  const c = 2*Math.atan2(Math.sqrt(aa), Math.sqrt(1-aa));
  return R*c;
}

async function obtenerPuntosHandoff(sid: number): Promise<{ lat: number; lon: number }[]> {
  const sRes = await pool.query("SELECT handoff_pick_lat, handoff_pick_lon, handoff_recolector_id, handoff_cur_lat, handoff_cur_lon FROM solicitudes WHERE id=$1", [sid]);
  const s = sRes.rows[0] || null;
  if (!s) return [];
  const pickLat = s.handoff_pick_lat!=null?Number(s.handoff_pick_lat):null;
  const pickLon = s.handoff_pick_lon!=null?Number(s.handoff_pick_lon):null;
  let r2Lat = s.handoff_cur_lat!=null?Number(s.handoff_cur_lat):null;
  let r2Lon = s.handoff_cur_lon!=null?Number(s.handoff_cur_lon):null;
  if (r2Lat==null || r2Lon==null) {
    const r2 = await pool.query("SELECT lat, lon FROM recolectores WHERE id=$1", [Number(s.handoff_recolector_id||0)]);
    const rr = r2.rows[0] || null;
    r2Lat = rr?.lat!=null?Number(rr.lat):null;
    r2Lon = rr?.lon!=null?Number(rr.lon):null;
  }
  if (r2Lat==null || r2Lon==null || pickLat==null || pickLon==null) return [];
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${r2Lon},${r2Lat};${pickLon},${pickLat}?overview=full&geometries=geojson`;
    const resp = await fetch(url);
    if (resp.ok) {
      const data: any = await resp.json();
      const coords: any[] = data?.routes?.[0]?.geometry?.coordinates || [];
      const pts = coords.map((c)=> ({ lat: Number(c[1]), lon: Number(c[0]) }));
      if (pts.length >= 2) return pts;
    }
  } catch {}
  const pts: { lat: number; lon: number }[] = [];
  const d = distMeters(r2Lat, r2Lon, pickLat, pickLon);
  const speed = 7;
  const dt = 0.4;
  const steps = Math.max(2, Math.ceil(d/(speed*dt)));
  for (let i=0;i<=steps;i++){
    const t = i/steps;
    pts.push({ lat: r2Lat + (pickLat - r2Lat)*t, lon: r2Lon + (pickLon - r2Lon)*t });
  }
  return pts;
}

async function emitirHandoffSSE(sid: number, lat: number, lon: number) {
  const set = viajeStreams.get(sid);
  const r = await pool.query("SELECT handoff_pick_lat, handoff_pick_lon FROM solicitudes WHERE id=$1", [sid]);
  const s = r.rows[0] || null;
  await pool.query("UPDATE solicitudes SET handoff_cur_lat=$2, handoff_cur_lon=$3 WHERE id=$1", [sid, Number(lat), Number(lon)]);
  if (set) {
    const payload = JSON.stringify({ sid, hand_lat: Number(lat), hand_lon: Number(lon), hand_pick_lat: s?.handoff_pick_lat!=null?Number(s.handoff_pick_lat):null, hand_pick_lon: s?.handoff_pick_lon!=null?Number(s.handoff_pick_lon):null, ts: Date.now() });
    set.forEach((rr) => { try { rr.write(`data: ${payload}\n\n`); } catch {} });
  }
}

(global as any).__handoffSimHooks = {
  iniciar: async (sid: number) => {
    const tPrev = handoffSimTimers.get(sid);
    if (tPrev) return;
    let pts = handoffSimPoints.get(sid);
    if (!pts || pts.length<2) {
      pts = await obtenerPuntosHandoff(sid);
      handoffSimPoints.set(sid, pts);
    }
    if (!pts || pts.length<2) return;
    let i = handoffSimProgress.get(sid) || 0;
    handoffSimProgress.set(sid, i);
    if (i < pts.length) { const p0 = pts[i]; await emitirHandoffSSE(sid, p0.lat, p0.lon); }
    const timer = setInterval(async ()=>{
      const arr = handoffSimPoints.get(sid) || [];
      const mult = Math.max(1, Math.floor(handoffSpeedMult.get(sid)||1));
      for (let step=0; step<mult; step++){
        if (i >= arr.length) break;
        const p = arr[i];
        await emitirHandoffSSE(sid, p.lat, p.lon);
        i++;
        handoffSimProgress.set(sid, i);
      }
      if (i >= arr.length) { clearInterval(timer); handoffSimTimers.delete(sid); return; }
    }, 400);
    handoffSimTimers.set(sid, timer);
  },
  detener: async (sid: number) => {
    const t = handoffSimTimers.get(sid);
    if (t) { try { clearInterval(t); } catch {} handoffSimTimers.delete(sid); }
  }
};

app.post("/api/viajes/:sid/handoff/speed", (req, res) => {
  const sid = Number(req.params.sid);
  const multRaw = (req.body||{}).mult;
  const multNum = multRaw!=null?Number(multRaw):NaN;
  const m = (!Number.isNaN(multNum) && multNum>=1 && multNum<=50) ? multNum : 1;
  handoffSpeedMult.set(sid, m);
  res.json({ ok: true, mult: m });
});

function emitirSSE(sid: number, lat: number, lon: number, i: number) {
  const set = viajeStreams.get(sid);
  (async ()=>{
    const r = await updateDeliveryProximityAndState(sid, Number(lat), Number(lon));
    const pauseUser = Boolean(r.pauseAtUser);
    const pauseHandoff = Boolean((r as any).pauseAtHandoff);
    const shouldPause = pauseUser || pauseHandoff;
    if (shouldPause) { const t = viajeSimTimers.get(sid); if (t) { try { clearInterval(t); } catch {} viajeSimTimers.delete(sid); } }
    const allowEmit = !shouldPause;
    if (allowEmit && set) {
      const payload = JSON.stringify({ sid, lat, lon, i, ts: Date.now() });
      set.forEach((rr) => { try { rr.write(`data: ${payload}\n\n`); } catch {} });
      console.log("emitirSSE_emit", { sid, i, pauseAtUser: pauseUser, pauseAtHandoff: pauseHandoff });
    } else {
      console.log("emitirSSE_block", { sid, i, pauseAtUser: pauseUser, pauseAtHandoff: pauseHandoff });
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
    let i = viajeSimProgress.get(sid) || 0;
    viajeSimProgress.set(sid, i);
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
  console.log(`Servidor iniciado en puerto ${env.port}`);
});
