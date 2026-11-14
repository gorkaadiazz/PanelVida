// Repositorio de la lista de deseos. Funciona sin conexión, como todos.

import { CONCEPTO_MAX } from '../lib/dinero'
import { validarDeseo, type DatosDeseoTexto } from '../lib/deseos'
import type { FechaDia } from '../lib/fechas'
import type { FilaLocal } from '../sync/tablas'
import { ErrorNoEncontrado, listar, transaccion, type Escritor } from './base'
import { quitarIdea } from './ideas'

export type Deseo = FilaLocal<'deseos'>
export type { DatosDeseoTexto }

export function listarDeseos(): Promise<Deseo[]> {
  return listar('deseos')
}

async function obtenerDeseo(e: Escritor, id: string): Promise<Deseo> {
  const deseo = await e.obtener('deseos', id)
  if (!deseo) throw new ErrorNoEncontrado('Ese artículo ya no está en la lista.')
  return deseo
}

/** Con `desdeIdea`, en la misma operación se borra esa idea de la bandeja. */
export async function crearDeseo(datos: DatosDeseoTexto, desdeIdea?: string): Promise<Deseo> {
  const limpios = validarDeseo(datos)
  return transaccion(async (e) => {
    const deseo = e.crear('deseos', { ...limpios, comprado: false, comprado_en: null })
    if (desdeIdea) await quitarIdea(e, desdeIdea)
    return deseo
  })
}

export async function editarDeseo(id: string, datos: DatosDeseoTexto): Promise<Deseo> {
  const limpios = validarDeseo(datos)
  return transaccion(async (e) => e.actualizar('deseos', await obtenerDeseo(e, id), limpios))
}

/**
 * Lo pasa al historial de comprados. Si `apuntarGasto`, en la MISMA operación
 * apunta el gasto en Dinero (categoría Compras, fecha de hoy): o las dos
 * cosas o ninguna.
 */
export async function marcarComprado(id: string, apuntarGasto: boolean, hoy: FechaDia): Promise<Deseo> {
  return transaccion(async (e) => {
    const anterior = await obtenerDeseo(e, id)
    if (anterior.comprado) return anterior
    if (apuntarGasto) {
      e.crear('movimientos', {
        tipo: 'gasto',
        concepto: anterior.articulo.slice(0, CONCEPTO_MAX),
        importe_centimos: anterior.precio_centimos,
        fecha: hoy,
        categoria: 'compras',
        necesidad: null,
        fijo_id: null,
      })
    }
    return e.actualizar('deseos', anterior, { comprado: true, comprado_en: hoy })
  })
}

/** Lo devuelve a la lista (el gasto, si se apuntó, se queda en Dinero). */
export async function devolverALista(id: string): Promise<Deseo> {
  return transaccion(async (e) => e.actualizar('deseos', await obtenerDeseo(e, id), { comprado: false, comprado_en: null }))
}

export async function borrarDeseo(id: string): Promise<void> {
  return transaccion((e) => e.borrar('deseos', id))
}
