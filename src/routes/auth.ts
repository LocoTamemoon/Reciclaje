import { Router, Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { registerUsuario, registerEmpresa, loginUsuario, loginEmpresa, setEmpresaCredentialsByRuc } from "../services/authService";

export const authRouter = Router();

authRouter.post("/register/usuario", asyncHandler(async (req: Request, res: Response) => {
  const { email, password, lat, lon } = req.body;
  const r = await registerUsuario(String(email), String(password), lat !== undefined ? Number(lat) : null, lon !== undefined ? Number(lon) : null);
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