import { pool } from "../db/pool";

export async function crearResenaEmpresa(
  empresaId: number,
  usuarioId: number,
  transaccionId: number,
  puntaje: number,
  mensaje: string | null
) {
  const res = await pool.query(
    "INSERT INTO resenas_empresas(empresa_id, usuario_id, transaccion_id, puntaje, mensaje) VALUES($1,$2,$3,$4,$5) RETURNING *",
    [empresaId, usuarioId, transaccionId, puntaje, mensaje]
  );
  return res.rows[0];
}

export async function crearResenaUsuario(
  usuarioId: number,
  empresaId: number,
  transaccionId: number,
  puntaje: number,
  mensaje: string | null
) {
  const res = await pool.query(
    "INSERT INTO resenas_usuarios(usuario_id, empresa_id, transaccion_id, puntaje, mensaje) VALUES($1,$2,$3,$4,$5) RETURNING *",
    [usuarioId, empresaId, transaccionId, puntaje, mensaje]
  );
  return res.rows[0];
}

export async function existeResenaEmpresa(empresaId: number, usuarioId: number, transaccionId: number) {
  const res = await pool.query(
    "SELECT 1 FROM resenas_empresas WHERE empresa_id=$1 AND usuario_id=$2 AND transaccion_id=$3 LIMIT 1",
    [empresaId, usuarioId, transaccionId]
  );
  return (res.rowCount || 0) > 0;
}

export async function existeResenaUsuario(usuarioId: number, empresaId: number, transaccionId: number) {
  const res = await pool.query(
    "SELECT 1 FROM resenas_usuarios WHERE usuario_id=$1 AND empresa_id=$2 AND transaccion_id=$3 LIMIT 1",
    [usuarioId, empresaId, transaccionId]
  );
  return (res.rowCount || 0) > 0;
}

export async function listarResenasEmpresa(empresaId: number) {
  const res = await pool.query(
    "SELECT re.id, re.puntaje, re.mensaje, re.creado_en, re.transaccion_id, re.usuario_id, COALESCE(u.email, 'Usuario ' || u.id) AS usuario_email FROM resenas_empresas re JOIN usuarios u ON u.id=re.usuario_id WHERE re.empresa_id=$1 ORDER BY re.creado_en DESC",
    [empresaId]
  );
  return res.rows;
}