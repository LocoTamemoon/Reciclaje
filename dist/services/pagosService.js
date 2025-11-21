"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registrarPesajeYPago = registrarPesajeYPago;
const transaccionesRepo_1 = require("../repositories/transaccionesRepo");
const empresasRepo_1 = require("../repositories/empresasRepo");
const solicitudesRepo_1 = require("../repositories/solicitudesRepo");
const usuariosRepo_1 = require("../repositories/usuariosRepo");
async function registrarPesajeYPago(empresaId, solicitudId, usuarioId, metodoPago, lat, lon, pesajes) {
    const materiales = await (0, empresasRepo_1.materialesDeEmpresa)(empresaId);
    const precios = new Map();
    for (const m of materiales)
        precios.set(m.material_id, Number(m.precio_por_kg));
    const puntosPor10kg = 40;
    const { transaccion, totalKg, puntos } = await (0, transaccionesRepo_1.crearTransaccionConPesaje)(solicitudId, usuarioId, empresaId, metodoPago, lat, lon, pesajes, precios, puntosPor10kg);
    await (0, solicitudesRepo_1.actualizarEstadoSolicitud)(solicitudId, "completada");
    await (0, usuariosRepo_1.acumularKgYPuntos)(usuarioId, totalKg, puntos);
    for (const p of pesajes) {
        await (0, usuariosRepo_1.upsertUsuarioMaterialTotal)(usuarioId, p.material_id, p.kg_finales);
    }
    return transaccion;
}
