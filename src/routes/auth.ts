import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { asyncHandler } from "../middleware/asyncHandler";
import { registerUsuario, registerEmpresa, loginUsuario, loginEmpresa, setEmpresaCredentialsByRuc, registerRecolector, loginRecolector } from "../services/authService";

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
  const { email, password, ruc, nombre, logo, lat, lon } = req.body;
  const r = await registerEmpresa(String(email), String(password), String(ruc), String(nombre), logo ? String(logo) : null, lat !== undefined ? Number(lat) : null, lon !== undefined ? Number(lon) : null);
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
  const { email, password, lat, lon } = req.body;
  const r = await registerRecolector(String(email), String(password), lat !== undefined ? Number(lat) : null, lon !== undefined ? Number(lon) : null);
  res.status(201).json(r);
}));

authRouter.post("/login/recolector", asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const r = await loginRecolector(String(email), String(password));
  res.json(r);
}));
