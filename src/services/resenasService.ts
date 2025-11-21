import { crearResenaEmpresa, crearResenaUsuario, existeResenaEmpresa, existeResenaUsuario } from "../repositories/resenasRepo";
import { actualizarReputacionEmpresa } from "../repositories/empresasRepo";
import { actualizarReputacionUsuario } from "../repositories/usuariosRepo";

export async function dejarResenaEmpresa(
  empresaId: number,
  usuarioId: number,
  transaccionId: number,
  puntaje: number,
  mensaje: string | null
) {
  if (await existeResenaEmpresa(empresaId, usuarioId, transaccionId)) {
    const err = new Error("resena_ya_existe");
    (err as any).code = "RESENA_DUP";
    throw err;
  }
  const r = await crearResenaEmpresa(empresaId, usuarioId, transaccionId, puntaje, mensaje);
  await actualizarReputacionEmpresa(empresaId, puntaje);
  return r;
}

export async function dejarResenaUsuario(
  usuarioId: number,
  empresaId: number,
  transaccionId: number,
  puntaje: number,
  mensaje: string | null
) {
  if (await existeResenaUsuario(usuarioId, empresaId, transaccionId)) {
    const err = new Error("resena_ya_existe");
    (err as any).code = "RESENA_DUP";
    throw err;
  }
  const r = await crearResenaUsuario(usuarioId, empresaId, transaccionId, puntaje, mensaje);
  await actualizarReputacionUsuario(usuarioId, puntaje);
  return r;
}