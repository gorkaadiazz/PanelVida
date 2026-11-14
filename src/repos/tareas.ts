// Repositorio de tareas. Las pantallas hablan con estas funciones, nunca con
// Supabase ni con IndexedDB. Todo funciona sin conexión.

import { ordenarTareas, validarFechaLimite, validarTextoTarea } from '../lib/tareas'
import type { FilaLocal } from '../sync/tablas'
import { ErrorNoEncontrado, listar, transaccion } from './base'
import { quitarIdea } from './ideas'

export type Tarea = FilaLocal<'tareas'>

export interface DatosTarea {
  texto: string
  /** AAAA-MM-DD; null o '' = sin fecha límite. */
  fecha_limite?: string | null
}

/** Todas las tareas, ya ordenadas: pendientes por fecha límite y después las hechas. */
export async function listarTareas(): Promise<Tarea[]> {
  return ordenarTareas(await listar('tareas'))
}

/**
 * Crea una tarea pendiente. Lanza ErrorDeValidacion si el texto o la fecha no
 * valen. Con `desdeIdea`, en la misma operación se borra esa idea de la bandeja.
 */
export async function crearTarea(datos: DatosTarea, desdeIdea?: string): Promise<Tarea> {
  const texto = validarTextoTarea(datos.texto)
  const fecha_limite = validarFechaLimite(datos.fecha_limite)
  return transaccion(async (e) => {
    const tarea = e.crear('tareas', { texto, fecha_limite, hecha: false, hecha_en: null })
    if (desdeIdea) await quitarIdea(e, desdeIdea)
    return tarea
  })
}

/** Cambia el texto y/o la fecha límite (lo que no se indique se queda igual). */
export async function editarTarea(id: string, cambios: Partial<DatosTarea>): Promise<Tarea> {
  const limpios: { texto?: string; fecha_limite?: string | null } = {}
  if (cambios.texto !== undefined) limpios.texto = validarTextoTarea(cambios.texto)
  if (cambios.fecha_limite !== undefined) limpios.fecha_limite = validarFechaLimite(cambios.fecha_limite)
  return transaccion(async (e) => {
    const anterior = await e.obtener('tareas', id)
    if (!anterior) throw new ErrorNoEncontrado('Esa tarea ya no existe.')
    return e.actualizar('tareas', anterior, limpios)
  })
}

/** Marca una tarea como hecha (apunta cuándo) o la devuelve a pendiente. */
export async function marcarTarea(id: string, hecha: boolean): Promise<Tarea> {
  return transaccion(async (e) => {
    const anterior = await e.obtener('tareas', id)
    if (!anterior) throw new ErrorNoEncontrado('Esa tarea ya no existe.')
    if (anterior.hecha === hecha) return anterior
    return e.actualizar('tareas', anterior, { hecha, hecha_en: hecha ? new Date().toISOString() : null })
  })
}

export async function borrarTarea(id: string): Promise<void> {
  return transaccion((e) => e.borrar('tareas', id))
}

/** Borra todas las tareas hechas. Devuelve cuántas ha quitado. */
export async function quitarHechas(): Promise<number> {
  return transaccion(async (e) => {
    const hechas = (await e.todos('tareas')).filter((t) => t.hecha)
    for (const t of hechas) await e.borrar('tareas', t.id)
    return hechas.length
  })
}
