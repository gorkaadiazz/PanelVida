// Lógica pura de los hábitos: rachas, porcentaje de hoy y cuadrícula semanal.
// Sin React ni Supabase: recibe filas y devuelve datos listos para pintar.

import { restarDias, ultimosDias, type FechaDia } from './fechas'
import { ErrorDeValidacion } from './validacion'

export { ErrorDeValidacion }

export const NOMBRE_HABITO_MAX = 60
export const DIAS_CUADRICULA = 7

/** Lo que estas funciones necesitan de un hábito. */
export interface HabitoBasico {
  id: string
  nombre: string
  orden: number
  archivado: boolean
}

/** Lo que estas funciones necesitan de una marca (una por hábito y día). */
export interface MarcaBasica {
  habito_id: string
  fecha: FechaDia
  hecho: boolean
}

export interface ResumenHoy {
  /** Hábitos activos marcados hoy. */
  hechos: number
  /** Hábitos activos (sin archivar). */
  total: number
  /** 0-100, entero. 0 si no hay hábitos. */
  porcentaje: number
}

export interface CeldaDia {
  fecha: FechaDia
  hecho: boolean
  esHoy: boolean
}

export interface FilaCuadricula<H extends HabitoBasico = HabitoBasico> {
  habito: H
  /** Racha actual en días. */
  racha: number
  /** Del día más antiguo al más reciente (hoy es la última celda). */
  dias: CeldaDia[]
}

export interface Cuadricula<H extends HabitoBasico = HabitoBasico> {
  /** Las columnas: los últimos días, del más antiguo a hoy. */
  dias: FechaDia[]
  filas: FilaCuadricula<H>[]
  resumen: ResumenHoy
}

/** Limpia el nombre de un hábito o lanza ErrorDeValidacion. */
export function validarNombreHabito(nombre: string): string {
  const limpio = nombre.trim().replace(/\s+/g, ' ')
  if (!limpio) throw new ErrorDeValidacion('Escribe un nombre para el hábito.')
  if (limpio.length > NOMBRE_HABITO_MAX) {
    throw new ErrorDeValidacion(`El nombre no puede tener más de ${NOMBRE_HABITO_MAX} caracteres.`)
  }
  return limpio
}

/** Hábitos sin archivar, en su orden (a igual orden, por nombre). */
export function habitosActivos<H extends HabitoBasico>(habitos: readonly H[]): H[] {
  return habitos
    .filter((h) => !h.archivado)
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es') || a.id.localeCompare(b.id))
}

/** Orden para un hábito nuevo: detrás de todos los que hay. */
export function siguienteOrden(habitos: readonly HabitoBasico[]): number {
  return habitos.reduce((max, h) => Math.max(max, h.orden), -1) + 1
}

/** Días hechos de cada hábito: habito_id -> conjunto de fechas. */
export function diasHechosPorHabito(marcas: readonly MarcaBasica[]): Map<string, Set<FechaDia>> {
  const mapa = new Map<string, Set<FechaDia>>()
  for (const m of marcas) {
    if (!m.hecho) continue
    let dias = mapa.get(m.habito_id)
    if (!dias) mapa.set(m.habito_id, (dias = new Set()))
    dias.add(m.fecha)
  }
  return mapa
}

/**
 * Racha actual: días seguidos hechos acabando hoy. Si hoy todavía no está
 * marcado, la racha cuenta hasta ayer (aún estás a tiempo: no se rompe hasta
 * que pase el día entero sin marcar).
 */
export function rachaActual(diasHechos: ReadonlySet<FechaDia> | readonly FechaDia[], hoy: FechaDia): number {
  const hechos: ReadonlySet<FechaDia> = diasHechos instanceof Set ? diasHechos : new Set(diasHechos as readonly FechaDia[])
  let dia = hechos.has(hoy) ? hoy : restarDias(hoy, 1)
  let racha = 0
  while (hechos.has(dia)) {
    racha += 1
    dia = restarDias(dia, 1)
  }
  return racha
}

/** Hechos hoy / total de hábitos activos. */
export function resumenHoy(habitos: readonly HabitoBasico[], marcas: readonly MarcaBasica[], hoy: FechaDia): ResumenHoy {
  const activos = habitosActivos(habitos)
  const hechosHoy = new Set(marcas.filter((m) => m.hecho && m.fecha === hoy).map((m) => m.habito_id))
  const hechos = activos.filter((h) => hechosHoy.has(h.id)).length
  const total = activos.length
  return { hechos, total, porcentaje: total === 0 ? 0 : Math.round((hechos / total) * 100) }
}

/** Solo el porcentaje de hoy (0-100). */
export function porcentajeHoy(habitos: readonly HabitoBasico[], marcas: readonly MarcaBasica[], hoy: FechaDia): number {
  return resumenHoy(habitos, marcas, hoy).porcentaje
}

/**
 * Datos de la cuadrícula: una fila por hábito activo con sus últimos `dias`
 * días y su racha. Para que la racha sea correcta, `marcas` debe traer todas
 * las del hábito, no solo las de la semana.
 */
export function cuadricula<H extends HabitoBasico>(
  habitos: readonly H[],
  marcas: readonly MarcaBasica[],
  hoy: FechaDia,
  dias: number = DIAS_CUADRICULA,
): Cuadricula<H> {
  const columnas = ultimosDias(dias, hoy)
  const hechos = diasHechosPorHabito(marcas)
  const vacio: ReadonlySet<FechaDia> = new Set()
  const filas = habitosActivos(habitos).map((habito) => {
    const suyos = hechos.get(habito.id) ?? vacio
    return {
      habito,
      racha: rachaActual(suyos, hoy),
      dias: columnas.map((fecha) => ({ fecha, hecho: suyos.has(fecha), esHoy: fecha === hoy })),
    }
  })
  return { dias: columnas, filas, resumen: resumenHoy(habitos, marcas, hoy) }
}
