"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dejarResenaEmpresa = dejarResenaEmpresa;
exports.dejarResenaUsuario = dejarResenaUsuario;
exports.dejarResenaRecolector = dejarResenaRecolector;
exports.dejarResenaEmpresaPorRecolector = dejarResenaEmpresaPorRecolector;
exports.dejarResenaUsuarioPorRecolector = dejarResenaUsuarioPorRecolector;
const resenasRepo_1 = require("../repositories/resenasRepo");
const empresasRepo_1 = require("../repositories/empresasRepo");
const usuariosRepo_1 = require("../repositories/usuariosRepo");
const recolectoresRepo_1 = require("../repositories/recolectoresRepo");
const transaccionesRepo_1 = require("../repositories/transaccionesRepo");
const solicitudesRepo_1 = require("../repositories/solicitudesRepo");
async function dejarResenaEmpresa(empresaId, usuarioId, transaccionId, puntaje, mensaje) {
    if (await (0, resenasRepo_1.existeResenaEmpresa)(empresaId, usuarioId, transaccionId)) {
        const err = new Error("resena_ya_existe");
        err.code = "RESENA_DUP";
        throw err;
    }
    const r = await (0, resenasRepo_1.crearResenaEmpresa)(empresaId, usuarioId, transaccionId, puntaje, mensaje);
    await (0, empresasRepo_1.actualizarReputacionEmpresa)(empresaId, puntaje);
    return r;
}
async function dejarResenaUsuario(usuarioId, empresaId, transaccionId, puntaje, mensaje) {
    if (await (0, resenasRepo_1.existeResenaUsuario)(usuarioId, empresaId, transaccionId)) {
        const err = new Error("resena_ya_existe");
        err.code = "RESENA_DUP";
        throw err;
    }
    const r = await (0, resenasRepo_1.crearResenaUsuario)(usuarioId, empresaId, transaccionId, puntaje, mensaje);
    await (0, usuariosRepo_1.actualizarReputacionUsuario)(usuarioId, puntaje);
    return r;
}
async function dejarResenaRecolector(evaluadorRol, evaluadorId, transaccionId, puntaje, mensaje) {
    const tx = await (0, transaccionesRepo_1.obtenerTransaccion)(Number(transaccionId));
    if (!tx) {
        const e = new Error("transaccion_not_found");
        e.code = 404;
        throw e;
    }
    const pago = Number(tx.monto_pagado || 0);
    const estado = String(tx.estado || '');
    if (!(estado === 'completada' && pago > 0)) {
        const e = new Error("no_pagada");
        e.code = 422;
        throw e;
    }
    const s = await (0, solicitudesRepo_1.obtenerSolicitud)(Number(tx.solicitud_id));
    if (!s) {
        const e = new Error("solicitud_not_found");
        e.code = 404;
        throw e;
    }
    let targetRecoId = null;
    if (evaluadorRol === 'empresa') {
        if (Number(tx.empresa_id) !== Number(evaluadorId)) {
            const e = new Error("empresa_mismatch");
            e.code = 403;
            throw e;
        }
        targetRecoId = s.recolector_id != null ? Number(s.recolector_id) : null;
    }
    else {
        if (Number(tx.usuario_id) !== Number(evaluadorId)) {
            const e = new Error("usuario_mismatch");
            e.code = 403;
            throw e;
        }
        const pick = s.pickup_recolector_id != null ? Number(s.pickup_recolector_id) : null;
        targetRecoId = pick || (s.recolector_id != null ? Number(s.recolector_id) : null);
    }
    if (!targetRecoId || Number.isNaN(targetRecoId) || targetRecoId <= 0) {
        const e = new Error("recolector_not_found_for_review");
        e.code = 422;
        throw e;
    }
    if (await (0, resenasRepo_1.existeResenaRecolector)(targetRecoId, evaluadorRol, evaluadorId, Number(transaccionId))) {
        const err = new Error("resena_ya_existe");
        err.code = "RESENA_DUP";
        throw err;
    }
    const r = await (0, resenasRepo_1.crearResenaRecolector)(targetRecoId, evaluadorRol, evaluadorId, Number(transaccionId), Number(tx.solicitud_id), puntaje, mensaje);
    await (0, recolectoresRepo_1.actualizarReputacionRecolector)(targetRecoId, puntaje);
    return r;
}
async function dejarResenaEmpresaPorRecolector(recolectorId, empresaId, transaccionId, puntaje, mensaje) {
    const tx = await (0, transaccionesRepo_1.obtenerTransaccion)(Number(transaccionId));
    if (!tx) {
        const e = new Error("transaccion_not_found");
        e.code = 404;
        throw e;
    }
    const pago = Number(tx.monto_pagado || 0);
    const estado = String(tx.estado || '');
    if (!(estado === 'completada' && pago > 0)) {
        const e = new Error("no_pagada");
        e.code = 422;
        throw e;
    }
    if (Number(tx.empresa_id) !== Number(empresaId)) {
        const e = new Error("empresa_mismatch");
        e.code = 403;
        throw e;
    }
    const s = await (0, solicitudesRepo_1.obtenerSolicitud)(Number(tx.solicitud_id));
    if (!s) {
        const e = new Error("solicitud_not_found");
        e.code = 404;
        throw e;
    }
    const finalRecoId = s.recolector_id != null ? Number(s.recolector_id) : null;
    if (Number(finalRecoId) !== Number(recolectorId)) {
        const e = new Error("recolector_no_entrego");
        e.code = 403;
        throw e;
    }
    if (await (0, resenasRepo_1.existeResenaEmpresaPorRecolector)(Number(empresaId), Number(recolectorId), Number(transaccionId))) {
        const err = new Error("resena_ya_existe");
        err.code = "RESENA_DUP";
        throw err;
    }
    const r = await (0, resenasRepo_1.crearResenaEmpresaPorRecolector)(Number(empresaId), Number(recolectorId), Number(transaccionId), puntaje, mensaje);
    await (0, empresasRepo_1.actualizarReputacionEmpresa)(Number(empresaId), puntaje);
    return r;
}
async function dejarResenaUsuarioPorRecolector(recolectorId, usuarioId, transaccionId, puntaje, mensaje) {
    const tx = await (0, transaccionesRepo_1.obtenerTransaccion)(Number(transaccionId));
    if (!tx) {
        const e = new Error("transaccion_not_found");
        e.code = 404;
        throw e;
    }
    const pago = Number(tx.monto_pagado || 0);
    const estado = String(tx.estado || '');
    if (!(estado === 'completada' && pago > 0)) {
        const e = new Error("no_pagada");
        e.code = 422;
        throw e;
    }
    if (Number(tx.usuario_id) !== Number(usuarioId)) {
        const e = new Error("usuario_mismatch");
        e.code = 403;
        throw e;
    }
    const s = await (0, solicitudesRepo_1.obtenerSolicitud)(Number(tx.solicitud_id));
    if (!s) {
        const e = new Error("solicitud_not_found");
        e.code = 404;
        throw e;
    }
    const pickRecoId = s.pickup_recolector_id != null ? Number(s.pickup_recolector_id) : null;
    const finalRecoId = s.recolector_id != null ? Number(s.recolector_id) : null;
    const canReview = Number(recolectorId) === Number(pickRecoId) || (pickRecoId == null && Number(recolectorId) === Number(finalRecoId));
    if (!canReview) {
        const e = new Error("recolector_no_recogio");
        e.code = 403;
        throw e;
    }
    if (await (0, resenasRepo_1.existeResenaUsuarioPorRecolector)(Number(usuarioId), Number(recolectorId), Number(transaccionId))) {
        const err = new Error("resena_ya_existe");
        err.code = "RESENA_DUP";
        throw err;
    }
    const r = await (0, resenasRepo_1.crearResenaUsuarioPorRecolector)(Number(usuarioId), Number(recolectorId), Number(transaccionId), puntaje, mensaje);
    await (0, usuariosRepo_1.actualizarReputacionUsuario)(Number(usuarioId), puntaje);
    return r;
}
