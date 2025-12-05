"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const asyncHandler_1 = require("../middleware/asyncHandler");
const pool_1 = require("../db/pool");
const authService_1 = require("../services/authService");
exports.authRouter = (0, express_1.Router)();
exports.authRouter.post("/register/usuario", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { email, password, nombre, apellidos, dni, foto_base64, home_lat, home_lon, current_lat, current_lon } = req.body;
    let fotoPath = null;
    try {
        if (foto_base64) {
            const dir = path_1.default.resolve("public", "img");
            try {
                fs_1.default.mkdirSync(dir, { recursive: true });
            }
            catch { }
            const code = Date.now().toString(36);
            const filename = `${code}_usuario_reg.png`;
            const full = path_1.default.join(dir, filename);
            const data = /^data:image\/(png|jpeg);base64,/i.test(String(foto_base64)) ? String(foto_base64).replace(/^data:image\/(png|jpeg);base64,/i, "") : String(foto_base64);
            const buf = Buffer.from(data, "base64");
            fs_1.default.writeFileSync(full, buf);
            fotoPath = `/img/${filename}`;
        }
    }
    catch { }
    const r = await (0, authService_1.registerUsuario)(String(email), String(password), nombre != null ? String(nombre) : null, apellidos != null ? String(apellidos) : null, dni != null ? String(dni) : null, fotoPath, home_lat !== undefined ? Number(home_lat) : null, home_lon !== undefined ? Number(home_lon) : null, current_lat !== undefined ? Number(current_lat) : null, current_lon !== undefined ? Number(current_lon) : null);
    res.status(201).json(r);
}));
exports.authRouter.post("/register/empresa", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { email, password, ruc, nombre, logo_base64, foto_local_1_base64, foto_local_2_base64, foto_local_3_base64, lat, lon } = req.body;
    if (!/^\d{11}$/.test(String(ruc))) {
        res.status(400).json({ error: "ruc_invalido" });
        return;
    }
    let logoPath = null;
    let f1Path = null;
    let f2Path = null;
    let f3Path = null;
    try {
        if (logo_base64) {
            const dir = path_1.default.resolve("public", "img");
            try {
                fs_1.default.mkdirSync(dir, { recursive: true });
            }
            catch { }
            const code = Date.now().toString(36);
            const filename = `${code}_empresa_logo.png`;
            const full = path_1.default.join(dir, filename);
            const data = /^data:image\/(png|jpeg);base64,/i.test(String(logo_base64)) ? String(logo_base64).replace(/^data:image\/(png|jpeg);base64,/i, "") : String(logo_base64);
            const buf = Buffer.from(data, "base64");
            fs_1.default.writeFileSync(full, buf);
            logoPath = `/img/${filename}`;
        }
        const dir = path_1.default.resolve("public", "img");
        try {
            fs_1.default.mkdirSync(dir, { recursive: true });
        }
        catch { }
        function save(b64, suffix) {
            if (!b64)
                return null;
            try {
                const code = Date.now().toString(36);
                const filename = `${code}_empresa_${suffix}.png`;
                const full = path_1.default.join(dir, filename);
                const data = /^data:image\/(png|jpeg);base64,/i.test(String(b64)) ? String(b64).replace(/^data:image\/(png|jpeg);base64,/i, "") : String(b64);
                const buf = Buffer.from(data, "base64");
                fs_1.default.writeFileSync(full, buf);
                return `/img/${filename}`;
            }
            catch {
                return null;
            }
        }
        f1Path = save(foto_local_1_base64, 'local1');
        f2Path = save(foto_local_2_base64, 'local2');
        f3Path = save(foto_local_3_base64, 'local3');
    }
    catch { }
    const r = await (0, authService_1.registerEmpresa)(String(email), String(password), String(ruc), String(nombre), logoPath, f1Path, f2Path, f3Path, lat !== undefined ? Number(lat) : null, lon !== undefined ? Number(lon) : null);
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
exports.authRouter.post("/register/recolector", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { email, password, nombre, apellidos, dni, distrito_id, foto_base64, foto_documento_base64, foto_vehiculo_base64, lat, lon, vehiculo_tipo_id, placa, capacidad_kg } = req.body;
    if (dni != null && !/^\d{7}$/.test(String(dni))) {
        res.status(400).json({ error: "dni_invalido" });
        return;
    }
    if (distrito_id != null) {
        const dr = await pool_1.pool.query("SELECT 1 FROM distritos WHERE id_distrito=$1", [Number(distrito_id)]);
        if (!dr.rows[0]) {
            res.status(422).json({ error: "distrito_invalido" });
            return;
        }
    }
    let fotoPath = null;
    let docPath = null;
    let vehPath = null;
    try {
        const dir = path_1.default.resolve("public", "img");
        try {
            fs_1.default.mkdirSync(dir, { recursive: true });
        }
        catch { }
        if (foto_base64) {
            const code = Date.now().toString(36);
            const filename = `${code}_reco_perfil.png`;
            const full = path_1.default.join(dir, filename);
            const data = /^data:image\/(png|jpeg);base64,/i.test(String(foto_base64)) ? String(foto_base64).replace(/^data:image\/(png|jpeg);base64,/i, "") : String(foto_base64);
            const buf = Buffer.from(data, "base64");
            fs_1.default.writeFileSync(full, buf);
            fotoPath = `/img/${filename}`;
        }
        if (foto_documento_base64) {
            const code = Date.now().toString(36);
            const filename = `${code}_reco_doc.png`;
            const full = path_1.default.join(dir, filename);
            const data = /^data:image\/(png|jpeg);base64,/i.test(String(foto_documento_base64)) ? String(foto_documento_base64).replace(/^data:image\/(png|jpeg);base64,/i, "") : String(foto_documento_base64);
            const buf = Buffer.from(data, "base64");
            fs_1.default.writeFileSync(full, buf);
            docPath = `/img/${filename}`;
        }
        if (foto_vehiculo_base64) {
            const code = Date.now().toString(36);
            const filename = `${code}_reco_veh.png`;
            const full = path_1.default.join(dir, filename);
            const data = /^data:image\/(png|jpeg);base64,/i.test(String(foto_vehiculo_base64)) ? String(foto_vehiculo_base64).replace(/^data:image\/(png|jpeg);base64,/i, "") : String(foto_vehiculo_base64);
            const buf = Buffer.from(data, "base64");
            fs_1.default.writeFileSync(full, buf);
            vehPath = `/img/${filename}`;
        }
    }
    catch { }
    const r = await (0, authService_1.registerRecolector)(String(email), String(password), nombre != null ? String(nombre) : null, apellidos != null ? String(apellidos) : null, dni != null ? String(dni) : null, distrito_id !== undefined ? (distrito_id != null ? Number(distrito_id) : null) : null, fotoPath, docPath, vehPath, lat !== undefined ? Number(lat) : null, lon !== undefined ? Number(lon) : null, vehiculo_tipo_id !== undefined ? (vehiculo_tipo_id != null ? Number(vehiculo_tipo_id) : null) : null, placa != null ? String(placa) : null, capacidad_kg !== undefined ? (capacidad_kg != null ? Number(capacidad_kg) : null) : null);
    res.status(201).json(r);
}));
exports.authRouter.post("/login/recolector", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { email, password } = req.body;
    const r = await (0, authService_1.loginRecolector)(String(email), String(password));
    res.json(r);
}));
