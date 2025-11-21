"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const asyncHandler_1 = require("../middleware/asyncHandler");
const authService_1 = require("../services/authService");
exports.authRouter = (0, express_1.Router)();
exports.authRouter.post("/register/usuario", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { email, password, lat, lon } = req.body;
    const r = await (0, authService_1.registerUsuario)(String(email), String(password), lat !== undefined ? Number(lat) : null, lon !== undefined ? Number(lon) : null);
    res.status(201).json(r);
}));
exports.authRouter.post("/register/empresa", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { email, password, ruc, nombre, logo, lat, lon } = req.body;
    const r = await (0, authService_1.registerEmpresa)(String(email), String(password), String(ruc), String(nombre), logo ? String(logo) : null, lat !== undefined ? Number(lat) : null, lon !== undefined ? Number(lon) : null);
    res.status(201).json(r);
}));
exports.authRouter.post("/login/usuario", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { email, password } = req.body;
    const r = await (0, authService_1.loginUsuario)(String(email), String(password));
    res.json(r);
}));
exports.authRouter.post("/set/empresa", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { ruc, email, password } = req.body;
    const e = await (0, authService_1.setEmpresaCredentialsByRuc)(String(ruc), String(email), String(password));
    res.json({ empresa: e });
}));
exports.authRouter.post("/login/empresa", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { email, password } = req.body;
    const r = await (0, authService_1.loginEmpresa)(String(email), String(password));
    res.json(r);
}));
