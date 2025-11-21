"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crearNuevaSolicitud = crearNuevaSolicitud;
exports.aceptarSolicitud = aceptarSolicitud;
exports.rechazarSolicitud = rechazarSolicitud;
exports.cancelarSolicitudPorUsuario = cancelarSolicitudPorUsuario;
const empresasRepo_1 = require("../repositories/empresasRepo");
const solicitudesRepo_1 = require("../repositories/solicitudesRepo");
const usuariosRepo_1 = require("../repositories/usuariosRepo");
async function crearNuevaSolicitud(usuarioId, empresaId, items) {
    const empresa = await (0, empresasRepo_1.obtenerEmpresa)(empresaId);
    if (!empresa)
        throw new Error("Empresa no encontrada");
    const solicitud = await (0, solicitudesRepo_1.crearSolicitud)(usuarioId, empresaId);
    await (0, usuariosRepo_1.incrementarSolicitudesUsuario)(usuarioId);
    if (items && items.length > 0)
        await (0, solicitudesRepo_1.guardarItemsSolicitudJSON)(Number(solicitud.id), items);
    return solicitud;
}
async function aceptarSolicitud(empresaId, solicitudId) {
    const solicitud = await (0, solicitudesRepo_1.obtenerSolicitud)(solicitudId);
    if (!solicitud || solicitud.empresa_id !== empresaId)
        throw new Error("Solicitud no válida");
    return await (0, solicitudesRepo_1.actualizarEstadoSolicitud)(solicitudId, "aceptada");
}
async function rechazarSolicitud(empresaId, solicitudId) {
    const solicitud = await (0, solicitudesRepo_1.obtenerSolicitud)(solicitudId);
    if (!solicitud || solicitud.empresa_id !== empresaId)
        throw new Error("Solicitud no válida");
    return await (0, solicitudesRepo_1.actualizarEstadoSolicitud)(solicitudId, "rechazada");
}
async function cancelarSolicitudPorUsuario(usuarioId, solicitudId) {
    const solicitud = await (0, solicitudesRepo_1.obtenerSolicitud)(solicitudId);
    if (!solicitud || solicitud.usuario_id !== usuarioId)
        throw new Error("Solicitud no válida");
    if (solicitud.estado !== "pendiente_empresa")
        throw new Error("Solicitud no cancelable");
    return await (0, solicitudesRepo_1.actualizarEstadoSolicitud)(solicitudId, "cancelada");
}
