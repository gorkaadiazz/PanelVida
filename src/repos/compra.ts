// Repositorio de la Lista de la compra. Funciona sin conexión (modo súper sin
// cobertura): todo va a la copia local y a la cola, y sube al volver.
// «Mi lista» es compra_mia; la Lista de casa (compra_casa) se añade con el hogar.

import { validarArticulo } from '../lib/compra'
import type { FilaLocal } from '../sync/tablas'
import { ErrorNoEncontrado, listar, transaccion } from './base'

export type ArticuloMio = FilaLocal<'compra_mia'>

export function listarMiLista(): Promise<ArticuloMio[]> {
  return listar('compra_mia')
}

/** Apunta un artículo. Lanza ErrorDeValidacion si el nombre está vacío o algo es demasiado largo. */
export async function apuntarEnMiLista(datos: { nombre: string; cantidad?: string; seccion?: string; notas?: string }): Promise<ArticuloMio> {
  const limpio = validarArticulo(datos)
  return transaccion((e) => e.crear('compra_mia', { ...limpio, comprado: false, comprado_en: null }))
}

export async function editarEnMiLista(
  id: string,
  datos: { nombre: string; cantidad?: string; seccion?: string; notas?: string },
): Promise<ArticuloMio> {
  const limpio = validarArticulo(datos)
  return transaccion(async (e) => {
    const anterior = await e.obtener('compra_mia', id)
    if (!anterior) throw new ErrorNoEncontrado('Ese artículo ya no está en la lista.')
    return e.actualizar('compra_mia', anterior, limpio)
  })
}

/** Marca o desmarca como comprado (un toque). */
export async function marcarEnMiLista(id: string, comprado: boolean): Promise<ArticuloMio> {
  return transaccion(async (e) => {
    const anterior = await e.obtener('compra_mia', id)
    if (!anterior) throw new ErrorNoEncontrado('Ese artículo ya no está en la lista.')
    return e.actualizar('compra_mia', anterior, { comprado, comprado_en: comprado ? new Date().toISOString() : null })
  })
}

export async function borrarDeMiLista(id: string): Promise<void> {
  return transaccion((e) => e.borrar('compra_mia', id))
}

/** «Quitar los comprados»: borra todo lo marcado. Devuelve cuántos ha quitado. */
export async function quitarCompradosDeMiLista(): Promise<number> {
  return transaccion(async (e) => {
    const comprados = (await e.todos('compra_mia')).filter((a) => a.comprado)
    for (const a of comprados) await e.borrar('compra_mia', a.id)
    return comprados.length
  })
}
