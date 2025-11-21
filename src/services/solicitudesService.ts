import { obtenerEmpresa } from "../repositories/empresasRepo";
import { crearSolicitud, actualizarEstadoSolicitud, obtenerSolicitud, guardarItemsSolicitudJSON } from "../repositories/solicitudesRepo";
import { incrementarSolicitudesUsuario } from "../repositories/usuariosRepo";

export async function crearNuevaSolicitud(usuarioId: number, empresaId: number, items?: { material_id: number; kg: number }[]) {
  const empresa = await obtenerEmpresa(empresaId);
  if (!empresa) throw new Error("Empresa no encontrada");
  const solicitud = await crearSolicitud(usuarioId, empresaId);
  await incrementarSolicitudesUsuario(usuarioId);
  if (items && items.length > 0) await guardarItemsSolicitudJSON(Number(solicitud.id), items);
  return solicitud;
}

export async function aceptarSolicitud(empresaId: number, solicitudId: number) {
  const solicitud = await obtenerSolicitud(solicitudId);
  if (!solicitud || solicitud.empresa_id !== empresaId) throw new Error("Solicitud no válida");
  return await actualizarEstadoSolicitud(solicitudId, "aceptada");
}

export async function rechazarSolicitud(empresaId: number, solicitudId: number) {
  const solicitud = await obtenerSolicitud(solicitudId);
  if (!solicitud || solicitud.empresa_id !== empresaId) throw new Error("Solicitud no válida");
  return await actualizarEstadoSolicitud(solicitudId, "rechazada");
}

export async function cancelarSolicitudPorUsuario(usuarioId: number, solicitudId: number) {
  const solicitud = await obtenerSolicitud(solicitudId);
  if (!solicitud || solicitud.usuario_id !== usuarioId) throw new Error("Solicitud no válida");
  if (solicitud.estado !== "pendiente_empresa") throw new Error("Solicitud no cancelable");
  return await actualizarEstadoSolicitud(solicitudId, "cancelada");
}