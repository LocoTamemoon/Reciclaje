import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool";
import { env } from "../config/env";

function signToken(payload: object) {
  const secret = process.env.JWT_SECRET || "devsecret";
  return jwt.sign(payload, secret, { expiresIn: "7d" });
}

export async function registerUsuario(
  email: string,
  password: string,
  nombre: string | null,
  apellidos: string | null,
  dni: string | null,
  foto_perfil_path: string | null,
  home_lat: number | null,
  home_lon: number | null,
  current_lat: number | null,
  current_lon: number | null
) {
  const hash = await bcrypt.hash(password, 10);
  const res = await pool.query(
    "INSERT INTO usuarios(email, password_hash, nombre, apellidos, dni, foto_perfil_path, home_lat, home_lon, current_lat, current_lon) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
    [email, hash, nombre, apellidos, dni, foto_perfil_path, home_lat, home_lon, current_lat, current_lon]
  );
  const u = res.rows[0];
  const token = signToken({ tipo: "usuario", id: u.id });
  return { token, usuario: u };
}

export async function registerEmpresa(
  email: string,
  password: string,
  ruc: string,
  nombre: string,
  logo: string | null,
  foto_local_1: string | null,
  foto_local_2: string | null,
  foto_local_3: string | null,
  lat: number | null,
  lon: number | null
) {
  const hash = await bcrypt.hash(password, 10);
  const res = await pool.query(
    "INSERT INTO empresas(email, password_hash, ruc, nombre, logo, foto_local_1, foto_local_2, foto_local_3, lat, lon) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
    [email, hash, ruc, nombre, logo, foto_local_1, foto_local_2, foto_local_3, lat, lon]
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

export async function registerRecolector(
  email: string,
  password: string,
  nombre: string | null,
  apellidos: string | null,
  dni: string | null,
  distrito_id: number | null,
  foto_perfil_path: string | null,
  foto_documento_path: string | null,
  foto_vehiculo_path: string | null,
  lat: number | null,
  lon: number | null,
  vehiculo_tipo_id: number | null,
  placa: string | null,
  capacidad_kg: number | null
) {
  const hash = await bcrypt.hash(password, 10);
  const res = await pool.query(
    "INSERT INTO recolectores(email, password_hash, nombre, apellidos, dni, id_distrito, foto_perfil, foto_documento, foto_vehiculo, lat, lon) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *",
    [email, hash, nombre, apellidos, dni, distrito_id, foto_perfil_path, foto_documento_path, foto_vehiculo_path, lat, lon]
  );
  const r = res.rows[0];
  if (vehiculo_tipo_id != null && placa && capacidad_kg != null) {
    try {
      const t = await pool.query("SELECT id FROM vehiculo_tipos WHERE id=$1 AND activo=true", [Number(vehiculo_tipo_id)]);
      if (t.rows[0]) {
        await pool.query(
          "INSERT INTO vehiculos(recolector_id, tipo_id, placa, capacidad_kg, activo) VALUES($1,$2,$3,$4,true)",
          [Number(r.id), Number(vehiculo_tipo_id), String(placa), Number(capacidad_kg)]
        );
      }
    } catch {}
  }
  const token = signToken({ tipo: "recolector", id: r.id });
  return { token, recolector: r };
}

export async function loginRecolector(email: string, password: string) {
  const res = await pool.query("SELECT * FROM recolectores WHERE email=$1", [email]);
  const r = res.rows[0];
  if (!r) throw new Error("credenciales_invalidas");
  const ok = await bcrypt.compare(password, r.password_hash || "");
  if (!ok) throw new Error("credenciales_invalidas");
  const token = signToken({ tipo: "recolector", id: r.id });
  return { token, recolector: r };
}
