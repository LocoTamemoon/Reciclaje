import { crearTransaccionConPesaje } from "../repositories/transaccionesRepo";
import { materialesDeEmpresa } from "../repositories/empresasRepo";
import { actualizarEstadoSolicitud } from "../repositories/solicitudesRepo";
import { acumularKgYPuntos, upsertUsuarioMaterialTotal } from "../repositories/usuariosRepo";

export async function registrarPesajeYPago(
  empresaId: number,
  solicitudId: number,
  usuarioId: number,
  metodoPago: string,
  lat: number | null,
  lon: number | null,
  pesajes: { material_id: number; kg_finales: number }[]
) {
  const materiales = await materialesDeEmpresa(empresaId);
  const precios = new Map<number, number>();
  for (const m of materiales) precios.set(m.material_id, Number(m.precio_por_kg));
  const puntosPor10kg = 40;
  const { transaccion, totalKg, puntos } = await crearTransaccionConPesaje(
    solicitudId,
    usuarioId,
    empresaId,
    metodoPago,
    lat,
    lon,
    pesajes,
    precios,
    puntosPor10kg
  );
  await actualizarEstadoSolicitud(solicitudId, "completada");
  await acumularKgYPuntos(usuarioId, totalKg, puntos);
  for (const p of pesajes) {
    await upsertUsuarioMaterialTotal(usuarioId, p.material_id, p.kg_finales);
  }
  return transaccion;
}