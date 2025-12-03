import { Router, Request, Response } from "express";
import { dejarResenaEmpresa, dejarResenaUsuario } from "../services/resenasService";
import { listarResenasEmpresa, listarResenasUsuario } from "../repositories/resenasRepo";
import { asyncHandler } from "../middleware/asyncHandler";

export const resenasRouter = Router();

resenasRouter.post("/empresa", asyncHandler(async (req: Request, res: Response) => {
  const { empresa_id, usuario_id, transaccion_id, puntaje, mensaje } = req.body;
  const r = await dejarResenaEmpresa(Number(empresa_id), Number(usuario_id), Number(transaccion_id), Number(puntaje), mensaje ? String(mensaje) : null);
  res.json(r);
}));

resenasRouter.post("/usuario", asyncHandler(async (req: Request, res: Response) => {
  const { usuario_id, empresa_id, transaccion_id, puntaje, mensaje } = req.body;
  const r = await dejarResenaUsuario(Number(usuario_id), Number(empresa_id), Number(transaccion_id), Number(puntaje), mensaje ? String(mensaje) : null);
  res.json(r);
}));

resenasRouter.get("/empresa/:id", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const list = await listarResenasEmpresa(id);
  res.json(list);
}));

resenasRouter.get("/usuario/:id", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const list = await listarResenasUsuario(id);
  res.json(list);
}));
