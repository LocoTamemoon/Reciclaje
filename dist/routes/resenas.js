"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resenasRouter = void 0;
const express_1 = require("express");
const resenasService_1 = require("../services/resenasService");
const resenasRepo_1 = require("../repositories/resenasRepo");
const asyncHandler_1 = require("../middleware/asyncHandler");
exports.resenasRouter = (0, express_1.Router)();
exports.resenasRouter.post("/empresa", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { empresa_id, usuario_id, transaccion_id, puntaje, mensaje } = req.body;
    const r = await (0, resenasService_1.dejarResenaEmpresa)(Number(empresa_id), Number(usuario_id), Number(transaccion_id), Number(puntaje), mensaje ? String(mensaje) : null);
    res.json(r);
}));
exports.resenasRouter.post("/usuario", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { usuario_id, empresa_id, transaccion_id, puntaje, mensaje } = req.body;
    const r = await (0, resenasService_1.dejarResenaUsuario)(Number(usuario_id), Number(empresa_id), Number(transaccion_id), Number(puntaje), mensaje ? String(mensaje) : null);
    res.json(r);
}));
exports.resenasRouter.post("/recolector", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { evaluador_rol, evaluador_id, transaccion_id, puntaje, mensaje } = req.body;
    const rol = String(evaluador_rol) === 'empresa' ? 'empresa' : 'usuario';
    const r = await (0, resenasService_1.dejarResenaRecolector)(rol, Number(evaluador_id), Number(transaccion_id), Number(puntaje), mensaje ? String(mensaje) : null);
    res.json(r);
}));
exports.resenasRouter.post("/recolector/empresa", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { empresa_id, recolector_id, transaccion_id, puntaje, mensaje } = req.body;
    const r = await (0, resenasService_1.dejarResenaEmpresaPorRecolector)(Number(recolector_id), Number(empresa_id), Number(transaccion_id), Number(puntaje), mensaje ? String(mensaje) : null);
    res.json(r);
}));
exports.resenasRouter.post("/recolector/usuario", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { usuario_id, recolector_id, transaccion_id, puntaje, mensaje } = req.body;
    const r = await (0, resenasService_1.dejarResenaUsuarioPorRecolector)(Number(recolector_id), Number(usuario_id), Number(transaccion_id), Number(puntaje), mensaje ? String(mensaje) : null);
    res.json(r);
}));
exports.resenasRouter.get("/empresa/:id", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const list = await (0, resenasRepo_1.listarResenasEmpresa)(id);
    res.json(list);
}));
exports.resenasRouter.get("/usuario/:id", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const list = await (0, resenasRepo_1.listarResenasUsuario)(id);
    res.json(list);
}));
exports.resenasRouter.get("/recolector/:id", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const list = await (0, resenasRepo_1.listarResenasRecolector)(id);
    res.json(list);
}));
