// La fila del perfil, que comparte la web de exámenes. Mi Panel solo lee y
// cambia la meta de ahorro (es una tabla `parcial` en sync/tablas.ts).

import { parsearMeta } from '../lib/dinero'
import type { FilaLocal } from '../sync/tablas'
import { ErrorNoEncontrado, listar, transaccion } from './base'

export type Perfil = FilaLocal<'perfiles'>

/** El perfil de la cuenta, o null si aún no se ha descargado. */
export async function obtenerPerfil(): Promise<Perfil | null> {
  const [perfil] = await listar('perfiles')
  return perfil ?? null
}

/** Guarda la meta de ahorro ('' = quitarla). Lanza ErrorDeValidacion si el importe no vale. */
export async function guardarMetaAhorro(texto: string): Promise<Perfil> {
  const meta = parsearMeta(texto)
  return transaccion(async (e) => {
    const [perfil] = await e.todos('perfiles')
    if (!perfil) throw new ErrorNoEncontrado('Tu perfil aún no ha llegado a este dispositivo. Conéctate a internet y vuelve a intentarlo.')
    return e.actualizar('perfiles', perfil, { meta_ahorro_centimos: meta })
  })
}
