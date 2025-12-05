"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerUsuario = registerUsuario;
exports.registerEmpresa = registerEmpresa;
exports.loginUsuario = loginUsuario;
exports.loginEmpresa = loginEmpresa;
exports.setEmpresaCredentialsByRuc = setEmpresaCredentialsByRuc;
exports.registerRecolector = registerRecolector;
exports.loginRecolector = loginRecolector;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const pool_1 = require("../db/pool");
function signToken(payload) {
    const secret = process.env.JWT_SECRET || "devsecret";
    return jsonwebtoken_1.default.sign(payload, secret, { expiresIn: "7d" });
}
async function registerUsuario(email, password, nombre, apellidos, dni, foto_perfil_path, home_lat, home_lon, current_lat, current_lon) {
    const hash = await bcryptjs_1.default.hash(password, 10);
    const res = await pool_1.pool.query("INSERT INTO usuarios(email, password_hash, nombre, apellidos, dni, foto_perfil_path, home_lat, home_lon, current_lat, current_lon) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *", [email, hash, nombre, apellidos, dni, foto_perfil_path, home_lat, home_lon, current_lat, current_lon]);
    const u = res.rows[0];
    const token = signToken({ tipo: "usuario", id: u.id });
    return { token, usuario: u };
}
async function registerEmpresa(email, password, ruc, nombre, logo, foto_local_1, foto_local_2, foto_local_3, lat, lon) {
    const hash = await bcryptjs_1.default.hash(password, 10);
    const res = await pool_1.pool.query("INSERT INTO empresas(email, password_hash, ruc, nombre, logo, foto_local_1, foto_local_2, foto_local_3, lat, lon) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *", [email, hash, ruc, nombre, logo, foto_local_1, foto_local_2, foto_local_3, lat, lon]);
    const e = res.rows[0];
    const token = signToken({ tipo: "empresa", id: e.id });
    return { token, empresa: e };
}
async function loginUsuario(email, password) {
    const res = await pool_1.pool.query("SELECT * FROM usuarios WHERE email=$1", [email]);
    const u = res.rows[0];
    if (!u)
        throw new Error("credenciales_invalidas");
    const ok = await bcryptjs_1.default.compare(password, u.password_hash || "");
    if (!ok)
        throw new Error("credenciales_invalidas");
    const token = signToken({ tipo: "usuario", id: u.id });
    return { token, usuario: u };
}
async function loginEmpresa(email, password) {
    const res = await pool_1.pool.query("SELECT * FROM empresas WHERE email=$1", [email]);
    const e = res.rows[0];
    if (!e)
        throw new Error("credenciales_invalidas");
    const ok = await bcryptjs_1.default.compare(password, e.password_hash || "");
    if (!ok)
        throw new Error("credenciales_invalidas");
    const token = signToken({ tipo: "empresa", id: e.id });
    return { token, empresa: e };
}
async function setEmpresaCredentialsByRuc(ruc, email, password) {
    const hash = await bcryptjs_1.default.hash(password, 10);
    const res = await pool_1.pool.query("UPDATE empresas SET email=$2, password_hash=$3 WHERE ruc=$1 RETURNING *", [ruc, email, hash]);
    return res.rows[0];
}
async function registerRecolector(email, password, nombre, apellidos, dni, distrito_id, foto_perfil_path, foto_documento_path, foto_vehiculo_path, lat, lon, vehiculo_tipo_id, placa, capacidad_kg) {
    const hash = await bcryptjs_1.default.hash(password, 10);
    const res = await pool_1.pool.query("INSERT INTO recolectores(email, password_hash, nombre, apellidos, dni, id_distrito, foto_perfil, foto_documento, foto_vehiculo, lat, lon) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *", [email, hash, nombre, apellidos, dni, distrito_id, foto_perfil_path, foto_documento_path, foto_vehiculo_path, lat, lon]);
    const r = res.rows[0];
    if (vehiculo_tipo_id != null && placa && capacidad_kg != null) {
        try {
            const t = await pool_1.pool.query("SELECT id FROM vehiculo_tipos WHERE id=$1 AND activo=true", [Number(vehiculo_tipo_id)]);
            if (t.rows[0]) {
                await pool_1.pool.query("INSERT INTO vehiculos(recolector_id, tipo_id, placa, capacidad_kg, activo) VALUES($1,$2,$3,$4,true)", [Number(r.id), Number(vehiculo_tipo_id), String(placa), Number(capacidad_kg)]);
            }
        }
        catch { }
    }
    const token = signToken({ tipo: "recolector", id: r.id });
    return { token, recolector: r };
}
async function loginRecolector(email, password) {
    const res = await pool_1.pool.query("SELECT * FROM recolectores WHERE email=$1", [email]);
    const r = res.rows[0];
    if (!r)
        throw new Error("credenciales_invalidas");
    const ok = await bcryptjs_1.default.compare(password, r.password_hash || "");
    if (!ok)
        throw new Error("credenciales_invalidas");
    const token = signToken({ tipo: "recolector", id: r.id });
    return { token, recolector: r };
}
