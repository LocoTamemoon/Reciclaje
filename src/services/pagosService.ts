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
  let empresaCambioValores = false;
  try {
    const origItems: any[] = Array.isArray((solPre as any)?.items_json) ? (solPre as any).items_json : [];
    const origMap = new Map<number, number>();
    for (const it of origItems) { try { origMap.set(Number(it.material_id), Number(it.kg||0)); } catch {} }
    const seen = new Set<number>();
    for (const p of pesajes) {
      const mid = Number(p.material_id);
      seen.add(mid);
      const origKg = origMap.has(mid) ? Number(origMap.get(mid)) : 0;
      if (Math.abs(Number(p.kg_finales) - origKg) > 1e-6) { empresaCambioValores = true; break; }
    }
    if (!empresaCambioValores) {
      for (const [mid, kg] of origMap.entries()) {
        if (!seen.has(Number(mid)) && Math.abs(Number(kg)) > 1e-6) { empresaCambioValores = true; break; }
      }
    }
  } catch {}
  await actualizarEstadoSolicitud(solicitudId, empresaCambioValores ? "completada_repesada" : "completada");
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
