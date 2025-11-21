import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool";
import { env } from "../config/env";

function signToken(payload: object) {
  const secret = process.env.JWT_SECRET || "devsecret";
  return jwt.sign(payload, secret, { expiresIn: "7d" });
}

export async function registerUsuario(email: string, password: string, lat: number | null, lon: number | null) {
  const hash = await bcrypt.hash(password, 10);
  const res = await pool.query(
    "INSERT INTO usuarios(email, password_hash, lat, lon) VALUES($1,$2,$3,$4) RETURNING *",
    [email, hash, lat, lon]
  );
  const u = res.rows[0];
  const token = signToken({ tipo: "usuario", id: u.id });
  return { token, usuario: u };
}

export async function registerEmpresa(email: string, password: string, ruc: string, nombre: string, logo: string | null, lat: number | null, lon: number | null) {
  const hash = await bcrypt.hash(password, 10);
  const res = await pool.query(
    "INSERT INTO empresas(email, password_hash, ruc, nombre, logo, lat, lon) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
    [email, hash, ruc, nombre, logo, lat, lon]
  );
  const e = res.rows[0];
  const token = signToken({ tipo: "empresa", id: e.id });
  return { token, empresa: e };
}

export async function loginUsuario(email: string, password: string) {
  const res = await pool.query("SELECT * FROM usuarios WHERE email=$1", [email]);
  const u = res.rows[0];
  if (!u) throw new Error("credenciales_invalidas");
  const ok = await bcrypt.compare(password, u.password_hash || "");
  if (!ok) throw new Error("credenciales_invalidas");
  const token = signToken({ tipo: "usuario", id: u.id });
  return { token, usuario: u };
}

export async function loginEmpresa(email: string, password: string) {
  const res = await pool.query("SELECT * FROM empresas WHERE email=$1", [email]);
  const e = res.rows[0];
  if (!e) throw new Error("credenciales_invalidas");
  const ok = await bcrypt.compare(password, e.password_hash || "");
  if (!ok) throw new Error("credenciales_invalidas");
  const token = signToken({ tipo: "empresa", id: e.id });
  return { token, empresa: e };
}

export async function setEmpresaCredentialsByRuc(ruc: string, email: string, password: string) {
  const hash = await bcrypt.hash(password, 10);
  const res = await pool.query(
    "UPDATE empresas SET email=$2, password_hash=$3 WHERE ruc=$1 RETURNING *",
    [ruc, email, hash]
  );
  return res.rows[0];
}