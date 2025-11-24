import { Router, Request, Response } from "express";
import { historialUsuario } from "../repositories/transaccionesRepo";
import { pool } from "../db/pool";
import { asyncHandler } from "../middleware/asyncHandler";
import { redimirPuntosUsuario } from "../repositories/usuariosRepo";

export const usuariosRouter = Router();

usuariosRouter.get("/:id/historial", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const data = await historialUsuario(id);
  res.json(data);
}));

usuariosRouter.get("/:id/dashboard", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const pendientes = await pool.query(
    "SELECT * FROM solicitudes WHERE usuario_id=$1 AND estado='pendiente_empresa' ORDER BY creado_en DESC",
    [id]
  );
  const anteriores = await pool.query(
    "SELECT * FROM solicitudes WHERE usuario_id=$1 AND estado <> 'pendiente_empresa' ORDER BY creado_en DESC",
    [id]
  );
  const historial = await historialUsuario(id);
  res.json({ solicitudes_pendientes: pendientes.rows, solicitudes_anteriores: anteriores.rows, historial_transacciones: historial });
}));

usuariosRouter.get("/:id/stats", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const total = await pool.query(
    "SELECT COALESCE(SUM(monto_pagado),0) AS monto_total FROM transacciones WHERE usuario_id=$1",
    [id]
  );
  const row = total.rows[0] || { monto_total: 0 };
  res.json({ monto_total: Number(row.monto_total) });
}));

const RECOMPENSAS = [
  { key: 'cinemark_entrada', nombre: 'Entrada de cine Cinemark', costo: 500 },
  { key: 'bembos_vale', nombre: 'Vale hamburguesa Bembos', costo: 320 },
  { key: 'plaza_vea_vale', nombre: 'Vale compras Plaza Vea', costo: 450 },
  { key: 'movilidad_descuento', nombre: 'Descuento en movilidad', costo: 200 }
];

usuariosRouter.get("/recompensas", asyncHandler(async (_req: Request, res: Response) => {
  res.json(RECOMPENSAS);
}));

usuariosRouter.post("/:id/recompensas/redimir", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { reward_key } = req.body;
  const r = RECOMPENSAS.find(x=>x.key===String(reward_key));
  if (!r) { res.status(400).json({ error: 'reward_not_found' }); return; }
  try {
    const out = await redimirPuntosUsuario(id, Number(r.costo), String(r.key));
    res.json({ ok: true, nuevo_puntos: out.nuevo_puntos });
  } catch (e: any) {
    if (String(e.message)==='insufficient_points') { res.status(400).json({ error: 'insufficient_points' }); return; }
    res.status(400).json({ error: 'redeem_failed' });
  }
}));

usuariosRouter.get("/:id/puntos/gastos", asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const rows = await pool.query(
    "SELECT reward_key, puntos, creado_en FROM usuario_puntos_gastos WHERE usuario_id=$1 ORDER BY creado_en DESC",
    [id]
  );
  res.json(rows.rows);
}));
