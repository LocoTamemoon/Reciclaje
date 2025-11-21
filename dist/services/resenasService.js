"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dejarResenaEmpresa = dejarResenaEmpresa;
exports.dejarResenaUsuario = dejarResenaUsuario;
const resenasRepo_1 = require("../repositories/resenasRepo");
const empresasRepo_1 = require("../repositories/empresasRepo");
const usuariosRepo_1 = require("../repositories/usuariosRepo");
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
