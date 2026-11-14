// Repositorio de la bandeja de ideas. Funciona sin conexión, como todos.

import { validarIdea } from '../lib/ideas'
import type { FilaLocal } from '../sync/tablas'
import { ErrorNoEncontrado, listar, transaccion, type Escritor } from './base'

export type Idea = FilaLocal<'ideas'>

export function listarIdeas(): Promise<Idea[]> {
  return listar('ideas')
}

/** Guarda una idea en un toque. Lanza ErrorDeValidacion si está vacía o es demasiado larga. */
export async function crearIdea(texto: string): Promise<Idea> {
  const limpio = validarIdea(texto)
  return transaccion((e) => e.crear('ideas', { texto: limpio, archivada: false }))
}

export async function archivarIdea(id: string, archivada: boolean): Promise<Idea> {
  return transaccion(async (e) => {
    const anterior = await e.obtener('ideas', id)
    if (!anterior) throw new ErrorNoEncontrado('Esa idea ya no existe.')
    return e.actualizar('ideas', anterior, { archivada })
  })
}

export async function borrarIdea(id: string): Promise<void> {
  return transaccion((e) => e.borrar('ideas', id))
}

/**
 * Dentro de la transacción que crea la tarea, el plan o el deseo: quita la
 * idea de la que sale. Si ya no existe (se borró en otro dispositivo), no pasa
 * nada: lo nuevo se crea igual.
 */
export async function quitarIdea(e: Escritor, id: string): Promise<void> {
  if (await e.obtener('ideas', id)) await e.borrar('ideas', id)
}
