// Repositorio de hábitos y de sus marcas diarias. Las pantallas hablan con
// estas funciones, nunca con Supabase ni con IndexedDB. Todo funciona sin
// conexión: se guarda en la copia local y se sube solo.

import { esFechaDia, hoy, type FechaDia } from '../lib/fechas'
import { ErrorDeValidacion, siguienteOrden, validarNombreHabito } from '../lib/habitos'
import { idMarca } from '../lib/uuid'
import type { FilaLocal } from '../sync/tablas'
import { ErrorNoEncontrado, listar, transaccion } from './base'

export type Habito = FilaLocal<'habitos'>
export type Marca = FilaLocal<'habito_marcas'>

export interface CambiosHabito {
  nombre?: string
  archivado?: boolean
  orden?: number
}

const porOrden = (a: Habito, b: Habito) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es') || a.id.localeCompare(b.id)

/** Todos los hábitos (también los archivados), en su orden. */
export async function listarHabitos(): Promise<Habito[]> {
  return (await listar('habitos')).sort(porOrden)
}

/** Crea un hábito al final de la lista. Lanza ErrorDeValidacion si el nombre no vale. */
export async function crearHabito(nombre: string): Promise<Habito> {
  const limpio = validarNombreHabito(nombre)
  return transaccion(async (e) => {
    const orden = siguienteOrden(await e.todos('habitos'))
    return e.crear('habitos', { nombre: limpio, orden, archivado: false })
  })
}

/** Cambia el nombre, el orden o si está archivado. */
export async function editarHabito(id: string, cambios: CambiosHabito): Promise<Habito> {
  const limpios: CambiosHabito = {}
  if (cambios.nombre !== undefined) limpios.nombre = validarNombreHabito(cambios.nombre)
  if (cambios.archivado !== undefined) limpios.archivado = cambios.archivado
  if (cambios.orden !== undefined) {
    if (!Number.isInteger(cambios.orden)) throw new ErrorDeValidacion('El orden no es válido.')
    limpios.orden = cambios.orden
  }
  return transaccion(async (e) => {
    const anterior = await e.obtener('habitos', id)
    if (!anterior) throw new ErrorNoEncontrado('Ese hábito ya no existe.')
    return e.actualizar('habitos', anterior, limpios)
  })
}

/**
 * Deja los hábitos en el orden de `ids` (0, 1, 2…). Los que no estén en la
 * lista no se tocan; solo se guardan los que cambian de posición.
 */
export async function reordenarHabitos(ids: readonly string[]): Promise<void> {
  return transaccion(async (e) => {
    for (const [orden, id] of ids.entries()) {
      const habito = await e.obtener('habitos', id)
      if (habito && habito.orden !== orden) e.actualizar('habitos', habito, { orden })
    }
  })
}

/** Borra un hábito con todas sus marcas. Para conservar el historial, mejor archivarlo. */
export async function borrarHabito(id: string): Promise<void> {
  return transaccion((e) => e.borrar('habitos', id))
}

/** Marcas de todos los hábitos; con `desde`, solo las de ese día en adelante. */
export async function listarMarcas(desde?: FechaDia): Promise<Marca[]> {
  const marcas = await listar('habito_marcas')
  return desde ? marcas.filter((m) => m.fecha >= desde) : marcas
}

/**
 * Marca (hecho = true) o desmarca (false) un hábito en un día. Desmarcar no
 * borra la fila: la deja con hecho = false, para que el último cambio gane al
 * sincronizar. El id de la marca se calcula a partir del hábito y del día, así
 * dos dispositivos escriben siempre la misma fila.
 */
export async function marcarDia(habitoId: string, fecha: FechaDia, hecho: boolean): Promise<Marca> {
  return cambiarMarca(habitoId, fecha, () => hecho)
}

/** Cambia la marca de un día a lo contrario de lo que tenga. */
export async function alternarDia(habitoId: string, fecha: FechaDia): Promise<Marca> {
  return cambiarMarca(habitoId, fecha, (anterior) => !anterior)
}

async function cambiarMarca(habitoId: string, fecha: FechaDia, decidir: (anterior: boolean) => boolean): Promise<Marca> {
  if (!esFechaDia(fecha)) throw new ErrorDeValidacion('La fecha no es válida.')
  if (fecha > hoy()) throw new ErrorDeValidacion('No se puede marcar un día que aún no ha llegado.')
  const id = idMarca(habitoId, fecha)
  return transaccion(async (e) => {
    if (!(await e.obtener('habitos', habitoId))) throw new ErrorNoEncontrado('Ese hábito ya no existe.')
    const anterior = await e.obtener('habito_marcas', id)
    const hecho = decidir(anterior?.hecho ?? false)
    if (!anterior) return e.crear('habito_marcas', { habito_id: habitoId, fecha, hecho }, id)
    if (anterior.hecho === hecho) return anterior
    return e.actualizar('habito_marcas', anterior, { hecho })
  })
}
