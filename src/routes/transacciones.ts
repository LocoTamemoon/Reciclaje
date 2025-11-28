import { Router, Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { obtenerTransaccion, obtenerPesajesTransaccion } from "../repositories/transaccionesRepo";
import { obtenerSolicitud } from "../repositories/solicitudesRepo";
import { existeResenaEmpresa, existeResenaUsuario } from "../repositories/resenasRepo";
import { materialesDeEmpresa } from "../repositories/empresasRepo";

export const transaccionesRouter = Router();

transaccionesRouter.get("/:id", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const tx = await obtenerTransaccion(id);
  if (!tx) { res.status(404).json({ error: "not_found" }); return; }
  const pesajes = await obtenerPesajesTransaccion(id);
  const precios = await materialesDeEmpresa(Number(tx.empresa_id));
  const precioMap = new Map<number, number>();
  for (const p of precios) precioMap.set(Number(p.material_id), Number(p.precio_por_kg));
  const detalle = pesajes.map((p: any) => {
    const precio = precioMap.get(Number(p.material_id)) || 0;
    const subtotal = Number(p.kg_finales) * precio;
    return { material_id: p.material_id, nombre: p.nombre, kg_finales: Number(p.kg_finales), precio_por_kg: precio, subtotal };
  });
  const total = detalle.reduce((a: number, d: any) => a + d.subtotal, 0);
  const comision_10 = total * 0.10;
  const total_con_comision = total + comision_10;
  const solicitud = await obtenerSolicitud(Number(tx.solicitud_id));
  const esDelivery = String((solicitud as any)?.tipo_entrega||'') === 'delivery';
  const delivery_fee = esDelivery ? Number((solicitud as any)?.delivery_fee||0) : 0;
  const usuario_neto = total - delivery_fee;
  const ya_resena_usuario = await existeResenaUsuario(Number(tx.usuario_id), Number(tx.empresa_id), id);
  const ya_resena_empresa = await existeResenaEmpresa(Number(tx.empresa_id), Number(tx.usuario_id), id);
  res.json({ transaccion: tx, detalle, total, delivery_fee, usuario_neto, comision_10, total_con_comision, ya_resena_usuario, ya_resena_empresa });
}));