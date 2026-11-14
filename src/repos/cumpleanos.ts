// Repositorio de cumpleaños. Funciona sin conexión, como todos.

import { validarCumple, type DatosCumpleTexto } from '../lib/cumpleanos'
import type { FechaDia } from '../lib/fechas'
import type { FilaLocal } from '../sync/tablas'
import { ErrorNoEncontrado, listar, transaccion } from './base'

export type Cumple = FilaLocal<'cumpleanos'>
export type { DatosCumpleTexto }

export function listarCumpleanos(): Promise<Cumple[]> {
  return listar('cumpleanos')
}

/** `hoy` sirve para validar el año (no puede ser futuro). */
export async function crearCumple(datos: DatosCumpleTexto, hoy: FechaDia): Promise<Cumple> {
  const limpios = validarCumple(datos, hoy)
  return transaccion((e) => e.crear('cumpleanos', limpios))
}

export async function editarCumple(id: string, datos: DatosCumpleTexto, hoy: FechaDia): Promise<Cumple> {
  const limpios = validarCumple(datos, hoy)
  return transaccion(async (e) => {
    const anterior = await e.obtener('cumpleanos', id)
    if (!anterior) throw new ErrorNoEncontrado('Ese cumpleaños ya no existe.')
    return e.actualizar('cumpleanos', anterior, limpios)
  })
}

export async function borrarCumple(id: string): Promise<void> {
  return transaccion((e) => e.borrar('cumpleanos', id))
}
