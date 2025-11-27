import { obtenerEmpresa, materialesDeEmpresa } from "../repositories/empresasRepo";
import { crearSolicitud, crearSolicitudDelivery, actualizarEstadoSolicitud, obtenerSolicitud, guardarItemsSolicitudJSON, cancelarPublicacionSolicitud, republicarSolicitudExpirada } from "../repositories/solicitudesRepo";
import { obtenerUsuario } from "../repositories/usuariosRepo";
import { incrementarSolicitudesUsuario } from "../repositories/usuariosRepo";

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function clasificarDistanciaPorKm(km: number): "ideal" | "normal" | "larga" {
  if (km <= 2) return "ideal";
  if (km <= 6) return "normal";
  return "larga";
}

function calcularFeePorBanda(banda: "ideal" | "normal" | "larga", km: number): number {
  let min = 0, max = 0, baseSpan = 0;
  if (banda === "ideal") { min = 3.5; max = 4.0; baseSpan = 2; }
  else if (banda === "normal") { min = 4.5; max = 6.0; baseSpan = 4; }
  else { min = 6.0; max = 8.0; baseSpan = 12; }
  let factor = 0;
  if (banda === "ideal") factor = Math.min(km / 2, 1);
  else if (banda === "normal") factor = Math.min((km - 2) / (6 - 2), 1);
  else factor = Math.min((km - 6) / baseSpan, 1);
  const bruto = min + (max - min) * Math.max(0, Math.min(1, factor));
  const rounded = Math.round(bruto * 10) / 10;
  return Math.min(rounded, max);
}

export async function crearNuevaSolicitud(usuarioId: number, empresaId: number, items?: { material_id: number; kg: number }[], delivery?: boolean, consent?: boolean, termsVersion?: string | null) {
  const empresa = await obtenerEmpresa(empresaId);
  if (!empresa) throw new Error("Empresa no encontrada");
  let solicitud: any;
  if (delivery) {
    const mats = await materialesDeEmpresa(empresaId);
    const precioMap = new Map<number, number>();
    for (const m of mats) precioMap.set(Number(m.material_id), Number(m.precio_por_kg));
    const itemsArr = Array.isArray(items) ? items : [];
    const totalEstimado = itemsArr.reduce((acc, it)=> acc + (Number(it.kg||0) * (precioMap.get(Number(it.material_id)) || 0)), 0);
    if (totalEstimado < 35) {
      const err = new Error("delivery_min_total");
      throw err;
    }
    const usuario = await obtenerUsuario(usuarioId);
    const uLat = Number(usuario?.lat || 0);
    const uLon = Number(usuario?.lon || 0);
    const eLat = Number(empresa?.lat || 0);
    const eLon = Number(empresa?.lon || 0);
    const km = (uLat && uLon && eLat && eLon) ? haversineKm(uLat, uLon, eLat, eLon) : 6.1;
    const banda = clasificarDistanciaPorKm(km);
    const fee = calcularFeePorBanda(banda, km);
    solicitud = await crearSolicitudDelivery(usuarioId, empresaId, fee, banda, Boolean(consent), termsVersion || null);
  } else {
    solicitud = await crearSolicitud(usuarioId, empresaId);
  }
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
  if (String(solicitud.tipo_entrega) === "delivery") {
    const s = await cancelarPublicacionSolicitud(solicitudId);
    return s;
  }
  return await actualizarEstadoSolicitud(solicitudId, "cancelada");
}

export async function republicarSolicitudPorUsuario(usuarioId: number, solicitudId: number) {
  const solicitud = await obtenerSolicitud(solicitudId);
  if (!solicitud || solicitud.usuario_id !== usuarioId) throw new Error("Solicitud no válida");
  if (String(solicitud.tipo_entrega) !== "delivery" || String(solicitud.estado) !== "expirada") throw new Error("Solicitud no republicable");
  const s = await republicarSolicitudExpirada(solicitudId);
  return s;
}
