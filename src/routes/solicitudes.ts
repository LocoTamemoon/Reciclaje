import { Router, Request, Response } from "express";
import { crearNuevaSolicitud, cancelarSolicitudPorUsuario, republicarSolicitudPorUsuario } from "../services/solicitudesService";
import { obtenerSolicitud } from "../repositories/solicitudesRepo";
import { asyncHandler } from "../middleware/asyncHandler";

export const solicitudesRouter = Router();

solicitudesRouter.post("/", asyncHandler(async (req: Request, res: Response) => {
  const { usuario_id, empresa_id, items, delivery, delivery_consent, delivery_terms_version } = req.body;
  const normalizedItems = Array.isArray(items) ? items.map((it: any)=>({ material_id: Number(it.material_id), kg: Number(it.kg) })) : [];
  const s = await crearNuevaSolicitud(Number(usuario_id), Number(empresa_id), normalizedItems, Boolean(delivery), Boolean(delivery_consent), delivery_terms_version ? String(delivery_terms_version) : null);
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

solicitudesRouter.get("/:sid", asyncHandler(async (req: Request, res: Response) => {
  const sid = Number(req.params.sid);
  const s = await obtenerSolicitud(sid);
  if (!s) { res.status(404).json({ error: "not_found" }); return; }
  res.json(s);
}));
