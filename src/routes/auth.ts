import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { asyncHandler } from "../middleware/asyncHandler";
import { pool } from "../db/pool";
import { registerUsuario, registerEmpresa, loginUsuario, loginEmpresa, setEmpresaCredentialsByRuc, registerRecolector, loginRecolector, loginAdmin } from "../services/authService";

export const authRouter = Router();

authRouter.post("/register/usuario", asyncHandler(async (req: Request, res: Response) => {
  const { email, password, nombre, apellidos, dni, foto_base64, home_lat, home_lon, current_lat, current_lon } = req.body;
  let fotoPath: string | null = null;
  try {
    if (foto_base64) {
      const dir = path.resolve("public", "img");
      try { fs.mkdirSync(dir, { recursive: true }); } catch {}
      const code = Date.now().toString(36);
      const filename = `${code}_usuario_reg.png`;
      const full = path.join(dir, filename);
      const data = /^data:image\/(png|jpeg);base64,/i.test(String(foto_base64)) ? String(foto_base64).replace(/^data:image\/(png|jpeg);base64,/i, "") : String(foto_base64);
      const buf = Buffer.from(data, "base64");
      fs.writeFileSync(full, buf);
      fotoPath = `/img/${filename}`;
    }
  } catch {}
  const r = await registerUsuario(
    String(email),
    String(password),
    nombre!=null ? String(nombre) : null,
    apellidos!=null ? String(apellidos) : null,
    dni!=null ? String(dni) : null,
    fotoPath,
    home_lat !== undefined ? Number(home_lat) : null,
    home_lon !== undefined ? Number(home_lon) : null,
    current_lat !== undefined ? Number(current_lat) : null,
    current_lon !== undefined ? Number(current_lon) : null
  );
  res.status(201).json(r);
}));

authRouter.post("/register/empresa", asyncHandler(async (req: Request, res: Response) => {
  const { email, password, ruc, nombre, logo_base64, foto_local_1_base64, foto_local_2_base64, foto_local_3_base64, lat, lon } = req.body;
  if (!/^\d{11}$/.test(String(ruc))) { res.status(400).json({ error: "ruc_invalido" }); return; }
  let logoPath: string | null = null;
  let f1Path: string | null = null;
  let f2Path: string | null = null;
  let f3Path: string | null = null;
  try {
    if (logo_base64) {
      const dir = path.resolve("public", "img");
      try { fs.mkdirSync(dir, { recursive: true }); } catch {}
      const code = Date.now().toString(36);
      const filename = `${code}_empresa_logo.png`;
      const full = path.join(dir, filename);
      const data = /^data:image\/(png|jpeg);base64,/i.test(String(logo_base64)) ? String(logo_base64).replace(/^data:image\/(png|jpeg);base64,/i, "") : String(logo_base64);
      const buf = Buffer.from(data, "base64");
      fs.writeFileSync(full, buf);
      logoPath = `/img/${filename}`;
    }
    const dir = path.resolve("public", "img");
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    function save(b64: any, suffix: string){
      if (!b64) return null;
      try {
        const code = Date.now().toString(36);
        const filename = `${code}_empresa_${suffix}.png`;
        const full = path.join(dir, filename);
        const data = /^data:image\/(png|jpeg);base64,/i.test(String(b64)) ? String(b64).replace(/^data:image\/(png|jpeg);base64,/i, "") : String(b64);
        const buf = Buffer.from(data, "base64");
        fs.writeFileSync(full, buf);
        return `/img/${filename}`;
      } catch { return null; }
    }
    f1Path = save(foto_local_1_base64, 'local1');
    f2Path = save(foto_local_2_base64, 'local2');
    f3Path = save(foto_local_3_base64, 'local3');
  } catch {}
  const r = await registerEmpresa(String(email), String(password), String(ruc), String(nombre), logoPath, f1Path, f2Path, f3Path, lat !== undefined ? Number(lat) : null, lon !== undefined ? Number(lon) : null);
  res.status(201).json(r);
}));

authRouter.post("/login/usuario", asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const r = await loginUsuario(String(email), String(password));
  res.json(r);
}));

authRouter.post("/set/empresa", asyncHandler(async (req: Request, res: Response) => {
  const { ruc, email, password } = req.body;
  const e = await setEmpresaCredentialsByRuc(String(ruc), String(email), String(password));
  res.json({ empresa: e });
}));

authRouter.post("/login/empresa", asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const r = await loginEmpresa(String(email), String(password));
  res.json(r);
}));

authRouter.post("/register/recolector", asyncHandler(async (req: Request, res: Response) => {
  const { email, password, nombre, apellidos, dni, distrito_id, foto_base64, foto_documento_base64, foto_vehiculo_base64, lat, lon, vehiculo_tipo_id, placa, capacidad_kg } = req.body;
  if (dni != null && !/^\d{7}$/.test(String(dni))) { res.status(400).json({ error: "dni_invalido" }); return; }
  if (distrito_id != null) {
    const dr = await pool.query("SELECT 1 FROM distritos WHERE id_distrito=$1", [Number(distrito_id)]);
    if (!dr.rows[0]) { res.status(422).json({ error: "distrito_invalido" }); return; }
  }
  let fotoPath: string | null = null;
  let docPath: string | null = null;
  let vehPath: string | null = null;
  try {
    const dir = path.resolve("public", "img");
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    if (foto_base64) {
      const code = Date.now().toString(36);
      const filename = `${code}_reco_perfil.png`;
      const full = path.join(dir, filename);
      const data = /^data:image\/(png|jpeg);base64,/i.test(String(foto_base64)) ? String(foto_base64).replace(/^data:image\/(png|jpeg);base64,/i, "") : String(foto_base64);
      const buf = Buffer.from(data, "base64");
      fs.writeFileSync(full, buf);
      fotoPath = `/img/${filename}`;
    }
    if (foto_documento_base64) {
      const code = Date.now().toString(36);
      const filename = `${code}_reco_doc.png`;
      const full = path.join(dir, filename);
      const data = /^data:image\/(png|jpeg);base64,/i.test(String(foto_documento_base64)) ? String(foto_documento_base64).replace(/^data:image\/(png|jpeg);base64,/i, "") : String(foto_documento_base64);
      const buf = Buffer.from(data, "base64");
      fs.writeFileSync(full, buf);
      docPath = `/img/${filename}`;
    }
    if (foto_vehiculo_base64) {
      const code = Date.now().toString(36);
      const filename = `${code}_reco_veh.png`;
      const full = path.join(dir, filename);
      const data = /^data:image\/(png|jpeg);base64,/i.test(String(foto_vehiculo_base64)) ? String(foto_vehiculo_base64).replace(/^data:image\/(png|jpeg);base64,/i, "") : String(foto_vehiculo_base64);
      const buf = Buffer.from(data, "base64");
      fs.writeFileSync(full, buf);
      vehPath = `/img/${filename}`;
    }
  } catch {}
  const capRaw = (req.body as any)?.capacidad_kg;
  const tipoRaw = (req.body as any)?.vehiculo_tipo_id;
  const placaRaw = (req.body as any)?.placa;
  if (tipoRaw == null || placaRaw == null || String(placaRaw).trim() === '' || capRaw == null || Number.isNaN(Number(capRaw))) {
    res.status(400).json({ error: "vehiculo_requerido" });
    return;
  }
  const r = await registerRecolector(
    String(email),
    String(password),
    nombre!=null ? String(nombre) : null,
    apellidos!=null ? String(apellidos) : null,
    dni!=null ? String(dni) : null,
    distrito_id !== undefined ? (distrito_id!=null ? Number(distrito_id) : null) : null,
    fotoPath,
    docPath,
    vehPath,
    lat !== undefined ? Number(lat) : null,
    lon !== undefined ? Number(lon) : null,
    vehiculo_tipo_id !== undefined ? (vehiculo_tipo_id!=null ? Number(vehiculo_tipo_id) : null) : null,
    placa != null ? String(placa) : null,
    capacidad_kg !== undefined ? (capacidad_kg!=null ? Number(capacidad_kg) : null) : null
  );
  res.status(201).json(r);
}));

authRouter.post("/login/recolector", asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const r = await loginRecolector(String(email), String(password));
  res.json(r);
}));

authRouter.post("/login/admin", asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const r = await loginAdmin(String(email), String(password));
  res.json(r);
}));
