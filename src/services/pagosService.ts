import { crearTransaccionConPesaje } from "../repositories/transaccionesRepo";
import { materialesDeEmpresa } from "../repositories/empresasRepo";
import { actualizarEstadoSolicitud, obtenerSolicitud } from "../repositories/solicitudesRepo";
import { acumularKgYPuntos, upsertUsuarioMaterialTotal } from "../repositories/usuariosRepo";
import { pool } from "../db/pool";

export async function registrarPesajeYPago(
  empresaId: number,
  solicitudId: number,
  usuarioId: number,
  metodoPago: string,
  lat: number | null,
  lon: number | null,
  pesajes: { material_id: number; kg_finales: number }[]
) {
  const solPre = await obtenerSolicitud(solicitudId);
  const modoEntrega = String(solPre?.tipo_entrega) === "delivery" ? "delivery" : "presencial";
  const materiales = await materialesDeEmpresa(empresaId);
  const precios = new Map<number, number>();
  for (const m of materiales) precios.set(m.material_id, Number(m.precio_por_kg));
  const puntosPor10kg = 40;
  const { transaccion, totalKg, puntos } = await crearTransaccionConPesaje(
    solicitudId,
    usuarioId,
    empresaId,
    metodoPago,
    modoEntrega,
    lat,
    lon,
    pesajes,
    precios,
    puntosPor10kg
  );
  await actualizarEstadoSolicitud(solicitudId, "completada");
  const sol = await obtenerSolicitud(solicitudId);
  if (sol && String(sol.tipo_entrega) === "delivery" && Number(sol.recolector_id || 0) > 0) {
    await pool.query("UPDATE recolectores SET trabajos_completados = trabajos_completados + 1 WHERE id=$1", [Number(sol.recolector_id)]);
  }
  await acumularKgYPuntos(usuarioId, totalKg, puntos);
  for (const p of pesajes) {
    await upsertUsuarioMaterialTotal(usuarioId, p.material_id, p.kg_finales);
  }
  return transaccion;
}