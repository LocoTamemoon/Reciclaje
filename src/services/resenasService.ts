import { crearResenaEmpresa, crearResenaUsuario, existeResenaEmpresa, existeResenaUsuario, crearResenaRecolector, existeResenaRecolector, crearResenaEmpresaPorRecolector, existeResenaEmpresaPorRecolector, crearResenaUsuarioPorRecolector, existeResenaUsuarioPorRecolector } from "../repositories/resenasRepo";
import { actualizarReputacionEmpresa } from "../repositories/empresasRepo";
import { actualizarReputacionUsuario } from "../repositories/usuariosRepo";
import { actualizarReputacionRecolector } from "../repositories/recolectoresRepo";
import { obtenerTransaccion } from "../repositories/transaccionesRepo";
import { obtenerSolicitud } from "../repositories/solicitudesRepo";

export async function dejarResenaEmpresa(
  empresaId: number,
  usuarioId: number,
  transaccionId: number,
  puntaje: number,
  mensaje: string | null
) {
  if (await existeResenaEmpresa(empresaId, usuarioId, transaccionId)) {
    const err = new Error("resena_ya_existe");
    (err as any).code = "RESENA_DUP";
    throw err;
  }
  const r = await crearResenaEmpresa(empresaId, usuarioId, transaccionId, puntaje, mensaje);
  await actualizarReputacionEmpresa(empresaId, puntaje);
  return r;
}

export async function dejarResenaUsuario(
  usuarioId: number,
  empresaId: number,
  transaccionId: number,
  puntaje: number,
  mensaje: string | null
) {
  if (await existeResenaUsuario(usuarioId, empresaId, transaccionId)) {
    const err = new Error("resena_ya_existe");
    (err as any).code = "RESENA_DUP";
    throw err;
  }
  const r = await crearResenaUsuario(usuarioId, empresaId, transaccionId, puntaje, mensaje);
  await actualizarReputacionUsuario(usuarioId, puntaje);
  return r;
}

export async function dejarResenaRecolector(
  evaluadorRol: 'usuario' | 'empresa',
  evaluadorId: number,
  transaccionId: number,
  puntaje: number,
  mensaje: string | null
) {
  const tx: any = await obtenerTransaccion(Number(transaccionId));
  if (!tx) { const e = new Error("transaccion_not_found"); (e as any).code = 404; throw e; }
  const pago = Number(tx.monto_pagado || 0);
  const estado = String(tx.estado || '');
  if (!(estado === 'completada' && pago > 0)) { const e = new Error("no_pagada"); (e as any).code = 422; throw e; }
  const s: any = await obtenerSolicitud(Number(tx.solicitud_id));
  if (!s) { const e = new Error("solicitud_not_found"); (e as any).code = 404; throw e; }
  let targetRecoId: number | null = null;
  if (evaluadorRol === 'empresa') {
    if (Number(tx.empresa_id) !== Number(evaluadorId)) { const e = new Error("empresa_mismatch"); (e as any).code = 403; throw e; }
    targetRecoId = s.recolector_id != null ? Number(s.recolector_id) : null;
  } else {
    if (Number(tx.usuario_id) !== Number(evaluadorId)) { const e = new Error("usuario_mismatch"); (e as any).code = 403; throw e; }
    const pick = s.pickup_recolector_id != null ? Number(s.pickup_recolector_id) : null;
    targetRecoId = pick || (s.recolector_id != null ? Number(s.recolector_id) : null);
  }
  if (!targetRecoId || Number.isNaN(targetRecoId) || targetRecoId <= 0) { const e = new Error("recolector_not_found_for_review"); (e as any).code = 422; throw e; }
  if (await existeResenaRecolector(targetRecoId, evaluadorRol, evaluadorId, Number(transaccionId))) {
    const err = new Error("resena_ya_existe");
    (err as any).code = "RESENA_DUP";
    throw err;
  }
  const r = await crearResenaRecolector(targetRecoId, evaluadorRol, evaluadorId, Number(transaccionId), Number(tx.solicitud_id), puntaje, mensaje);
  await actualizarReputacionRecolector(targetRecoId, puntaje);
  return r;
}

export async function dejarResenaEmpresaPorRecolector(
  recolectorId: number,
  empresaId: number,
  transaccionId: number,
  puntaje: number,
  mensaje: string | null
) {
  const tx: any = await obtenerTransaccion(Number(transaccionId));
  if (!tx) { const e = new Error("transaccion_not_found"); (e as any).code = 404; throw e; }
  const pago = Number(tx.monto_pagado || 0);
  const estado = String(tx.estado || '');
  if (!(estado === 'completada' && pago > 0)) { const e = new Error("no_pagada"); (e as any).code = 422; throw e; }
  if (Number(tx.empresa_id) !== Number(empresaId)) { const e = new Error("empresa_mismatch"); (e as any).code = 403; throw e; }
  const s: any = await obtenerSolicitud(Number(tx.solicitud_id));
  if (!s) { const e = new Error("solicitud_not_found"); (e as any).code = 404; throw e; }
  const finalRecoId = s.recolector_id != null ? Number(s.recolector_id) : null;
  if (Number(finalRecoId) !== Number(recolectorId)) { const e = new Error("recolector_no_entrego"); (e as any).code = 403; throw e; }
  if (await existeResenaEmpresaPorRecolector(Number(empresaId), Number(recolectorId), Number(transaccionId))) {
    const err = new Error("resena_ya_existe");
    (err as any).code = "RESENA_DUP";
    throw err;
  }
  const r = await crearResenaEmpresaPorRecolector(Number(empresaId), Number(recolectorId), Number(transaccionId), puntaje, mensaje);
  await actualizarReputacionEmpresa(Number(empresaId), puntaje);
  return r;
}

export async function dejarResenaUsuarioPorRecolector(
  recolectorId: number,
  usuarioId: number,
  transaccionId: number,
  puntaje: number,
  mensaje: string | null
) {
  const tx: any = await obtenerTransaccion(Number(transaccionId));
  if (!tx) { const e = new Error("transaccion_not_found"); (e as any).code = 404; throw e; }
  const pago = Number(tx.monto_pagado || 0);
  const estado = String(tx.estado || '');
  if (!(estado === 'completada' && pago > 0)) { const e = new Error("no_pagada"); (e as any).code = 422; throw e; }
  if (Number(tx.usuario_id) !== Number(usuarioId)) { const e = new Error("usuario_mismatch"); (e as any).code = 403; throw e; }
  const s: any = await obtenerSolicitud(Number(tx.solicitud_id));
  if (!s) { const e = new Error("solicitud_not_found"); (e as any).code = 404; throw e; }
  const pickRecoId = s.pickup_recolector_id != null ? Number(s.pickup_recolector_id) : null;
  const finalRecoId = s.recolector_id != null ? Number(s.recolector_id) : null;
  const canReview = Number(recolectorId) === Number(pickRecoId) || (pickRecoId == null && Number(recolectorId) === Number(finalRecoId));
  if (!canReview) { const e = new Error("recolector_no_recogio"); (e as any).code = 403; throw e; }
  if (await existeResenaUsuarioPorRecolector(Number(usuarioId), Number(recolectorId), Number(transaccionId))) {
    const err = new Error("resena_ya_existe");
    (err as any).code = "RESENA_DUP";
    throw err;
  }
  const r = await crearResenaUsuarioPorRecolector(Number(usuarioId), Number(recolectorId), Number(transaccionId), puntaje, mensaje);
  await actualizarReputacionUsuario(Number(usuarioId), puntaje);
  return r;
}
