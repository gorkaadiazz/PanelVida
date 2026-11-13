// Lógica pura de las tareas: orden, urgencia y recuentos para Inicio.
// Sin React ni Supabase.

import { esFechaDia, sumarDias, type FechaDia } from './fechas'
import { ErrorDeValidacion } from './validacion'

export { ErrorDeValidacion }

export const TEXTO_TAREA_MAX = 200

/** Lo que estas funciones necesitan de una tarea. */
export interface TareaBasica {
  id: string
  texto: string
  fecha_limite: FechaDia | null
  hecha: boolean
  /** Instante (ISO) en que se marcó como hecha. */
  hecha_en: string | null
  created_at: string
}

/**
 * Urgencia de una tarea:
 *  - 'atrasada': pendiente y su fecha límite ya pasó (rojo).
 *  - 'proxima': pendiente y vence hoy o mañana (ámbar).
 *  - 'normal': el resto (sin fecha, con fecha más lejana o ya hecha).
 */
export type Urgencia = 'atrasada' | 'proxima' | 'normal'

export interface RecuentoTareas {
  /** Tareas sin hacer (incluye las atrasadas y las próximas). */
  pendientes: number
  atrasadas: number
  /** Pendientes que vencen hoy o mañana. */
  proximas: number
  hechas: number
}

type ParaUrgencia = Pick<TareaBasica, 'fecha_limite' | 'hecha'>

/** Limpia el texto de una tarea o lanza ErrorDeValidacion. */
export function validarTextoTarea(texto: string): string {
  const limpio = texto.trim().replace(/\s+/g, ' ')
  if (!limpio) throw new ErrorDeValidacion('Escribe qué hay que hacer.')
  if (limpio.length > TEXTO_TAREA_MAX) {
    throw new ErrorDeValidacion(`La tarea no puede tener más de ${TEXTO_TAREA_MAX} caracteres.`)
  }
  return limpio
}

/** Normaliza la fecha límite ('' o null = sin fecha) o lanza ErrorDeValidacion. */
export function validarFechaLimite(fecha: string | null | undefined): FechaDia | null {
  if (fecha === null || fecha === undefined || fecha === '') return null
  if (!esFechaDia(fecha)) throw new ErrorDeValidacion('La fecha límite no es válida.')
  return fecha
}

/** Clasifica una tarea respecto a `hoy` (día de Madrid, lib/fechas). */
export function urgencia(tarea: ParaUrgencia, hoy: FechaDia): Urgencia {
  if (tarea.hecha || !tarea.fecha_limite) return 'normal'
  // Las fechas AAAA-MM-DD se pueden comparar como texto
  if (tarea.fecha_limite < hoy) return 'atrasada'
  if (tarea.fecha_limite <= sumarDias(hoy, 1)) return 'proxima'
  return 'normal'
}

/**
 * Orden de la lista:
 *  1. Pendientes, por fecha límite (la más cercana o más atrasada primero);
 *     las que no tienen fecha, al final. A igualdad, la más antigua primero.
 *  2. Hechas, la última que se completó primero.
 * Devuelve una lista nueva.
 */
export function ordenarTareas<T extends TareaBasica>(tareas: readonly T[]): T[] {
  return [...tareas].sort((a, b) => {
    if (a.hecha !== b.hecha) return a.hecha ? 1 : -1
    if (a.hecha) {
      return instante(b.hecha_en) - instante(a.hecha_en) || desempate(a, b)
    }
    if (a.fecha_limite !== b.fecha_limite) {
      if (a.fecha_limite === null) return 1
      if (b.fecha_limite === null) return -1
      return a.fecha_limite < b.fecha_limite ? -1 : 1
    }
    return desempate(a, b)
  })
}

function instante(iso: string | null): number {
  const ms = iso ? Date.parse(iso) : NaN
  return Number.isNaN(ms) ? 0 : ms
}

function desempate(a: TareaBasica, b: TareaBasica): number {
  return instante(a.created_at) - instante(b.created_at) || a.id.localeCompare(b.id)
}

/** Recuentos para la tarjeta de Inicio y la cabecera de Tareas. */
export function recuentoTareas(tareas: readonly ParaUrgencia[], hoy: FechaDia): RecuentoTareas {
  const r: RecuentoTareas = { pendientes: 0, atrasadas: 0, proximas: 0, hechas: 0 }
  for (const t of tareas) {
    if (t.hecha) {
      r.hechas += 1
      continue
    }
    r.pendientes += 1
    const u = urgencia(t, hoy)
    if (u === 'atrasada') r.atrasadas += 1
    else if (u === 'proxima') r.proximas += 1
  }
  return r
}
