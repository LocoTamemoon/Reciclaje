import { Router, Request, Response } from "express";
import { listarEmpresas, materialesDeEmpresa, crearEmpresa } from "../repositories/empresasRepo";
import { upsertEmpresaMaterialPrecio, eliminarEmpresaMaterial } from "../repositories/materialesRepo";
import { solicitudesPendientesEmpresa } from "../repositories/solicitudesRepo";
import { aceptarSolicitud, rechazarSolicitud } from "../services/solicitudesService";
import { obtenerSolicitud } from "../repositories/solicitudesRepo";
import { registrarPesajeYPago } from "../services/pagosService";
import { asyncHandler } from "../middleware/asyncHandler";

export const empresasRouter = Router();

empresasRouter.get("/", asyncHandler(async (req: Request, res: Response) => {
  const data = await listarEmpresas();
  res.json(data);
}));

empresasRouter.post("/", asyncHandler(async (req: Request, res: Response) => {
  const { ruc, nombre, logo, lat, lon } = req.body;
  const empresa = await crearEmpresa(String(ruc), String(nombre), logo ? String(logo) : null, lat !== undefined ? Number(lat) : null, lon !== undefined ? Number(lon) : null);
  res.status(201).json(empresa);
}));

empresasRouter.get("/:id/materiales", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const data = await materialesDeEmpresa(id);
  res.json(data);
}));

empresasRouter.post("/:id/materiales/upsert", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const results = [] as any[];
  for (const it of items) {
    const r = await upsertEmpresaMaterialPrecio(id, Number(it.material_id), Number(it.precio_por_kg));
    results.push(r);
  }
  res.json({ updated: results.length });
}));

empresasRouter.delete("/:id/materiales/:mid", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const mid = Number(req.params.mid);
  await eliminarEmpresaMaterial(id, mid);
  res.json({ removed: true });
}));

empresasRouter.get("/:id/solicitudes", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const data = await solicitudesPendientesEmpresa(id);
  res.json(data);
}));

empresasRouter.post("/:id/solicitudes/:sid/aceptar", asyncHandler(async (req: Request, res: Response) => {
  const empresaId = Number(req.params.id);
  const solicitudId = Number(req.params.sid);
  const s = await aceptarSolicitud(empresaId, solicitudId);
  const sol = await obtenerSolicitud(solicitudId);
  const items = Array.isArray((sol as any)?.items_json) ? (sol as any).items_json : [];
  const pesajes = items.map((it: any)=>({ material_id: Number(it.material_id), kg_finales: Number(it.kg) }));
  const t = await registrarPesajeYPago(
    empresaId,
    solicitudId,
    Number(s.usuario_id),
    "efectivo",
    null,
    null,
    pesajes
  );
  res.json({ solicitud: s, transaccion: t });
}));

empresasRouter.post("/:id/solicitudes/:sid/rechazar", asyncHandler(async (req: Request, res: Response) => {
  const empresaId = Number(req.params.id);
  const solicitudId = Number(req.params.sid);
  const s = await rechazarSolicitud(empresaId, solicitudId);
  res.json(s);
}));

empresasRouter.post("/:id/solicitudes/:sid/pesaje_pago", asyncHandler(async (req: Request, res: Response) => {
  const empresaId = Number(req.params.id);
  const solicitudId = Number(req.params.sid);
  const { usuario_id, metodo_pago, lat, lon, pesajes } = req.body;
  const t = await registrarPesajeYPago(
    empresaId,
    solicitudId,
    Number(usuario_id),
    String(metodo_pago),
    lat !== undefined ? Number(lat) : null,
    lon !== undefined ? Number(lon) : null,
    Array.isArray(pesajes) ? pesajes.map((p: any) => ({ material_id: Number(p.material_id), kg_finales: Number(p.kg_finales) })) : []
  );
  res.json(t);
}));