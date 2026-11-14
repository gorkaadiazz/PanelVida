// Planes pendientes: estados, filtros, orden y el próximo plan. Lógica pura.
//
// Estados: idea → planeado (con fecha) → hecho (con valoración 1-5 opcional).

import { parsearPrecio } from './dinero'
import { esFechaDia, type FechaDia } from './fechas'
import { ErrorDeValidacion } from './validacion'

export { ErrorDeValidacion }

export const TIPOS_PLAN = ['sitio', 'viaje', 'actividad', 'comida', 'otro'] as const
export type TipoPlan = (typeof TIPOS_PLAN)[number]
export const NOMBRE_TIPO_PLAN: Record<TipoPlan, string> = { sitio: 'Sitio', viaje: 'Viaje', actividad: 'Actividad', comida: 'Comida', otro: 'Otro' }

export const ESTADOS_PLAN = ['idea', 'planeado', 'hecho'] as const
export type EstadoPlan = (typeof ESTADOS_PLAN)[number]
export const NOMBRE_ESTADO_PLAN: Record<EstadoPlan, string> = { idea: 'Idea', planeado: 'Planeado', hecho: 'Hecho' }

export const TITULO_PLAN_MAX = 120
export const CON_QUIEN_MAX = 120
export const NOTAS_PLAN_MAX = 1000
export const COMENTARIO_MAX = 500

export interface PlanBasico {
  id: string
  titulo: string
  tipo: string
  fecha: FechaDia | null
  estado: string
  created_at: string
}

export const esTipoPlan = (v: unknown): v is TipoPlan => typeof v === 'string' && (TIPOS_PLAN as readonly string[]).includes(v)
export const esEstadoPlan = (v: unknown): v is EstadoPlan => typeof v === 'string' && (ESTADOS_PLAN as readonly string[]).includes(v)

export interface DatosPlanTexto {
  titulo: string
  tipo: string
  con_quien: string
  /** AAAA-MM-DD o '' (sin fecha). */
  fecha: string
  /** Como lo escribe el usuario ("30", "12,50") o '' (sin coste). */
  coste: string
  notas: string
}

export function validarPlan(datos: DatosPlanTexto) {
  const titulo = datos.titulo.trim().replace(/\s+/g, ' ')
  if (!titulo) throw new ErrorDeValidacion('Escribe qué plan es.')
  if (titulo.length > TITULO_PLAN_MAX) throw new ErrorDeValidacion(`El título no puede tener más de ${TITULO_PLAN_MAX} caracteres.`)
  if (!esTipoPlan(datos.tipo)) throw new ErrorDeValidacion('Elige el tipo de plan.')
  const con_quien = datos.con_quien.trim().replace(/\s+/g, ' ')
  if (con_quien.length > CON_QUIEN_MAX) throw new ErrorDeValidacion(`«Con quién» no puede tener más de ${CON_QUIEN_MAX} caracteres.`)
  const fecha = datos.fecha.trim() || null
  if (fecha !== null && !esFechaDia(fecha)) throw new ErrorDeValidacion('La fecha no es válida.')
  const coste_centimos = datos.coste.trim() ? parsearPrecio(datos.coste) : null
  const notas = datos.notas.trim()
  if (notas.length > NOTAS_PLAN_MAX) throw new ErrorDeValidacion(`Las notas no pueden tener más de ${NOTAS_PLAN_MAX} caracteres.`)
  return { titulo, tipo: datos.tipo, con_quien, fecha, coste_centimos, notas }
}

/**
 * Estado al guardar: con fecha, una idea pasa sola a «planeado»; sin fecha,
 * un «planeado» vuelve a «idea» (planeado siempre tiene fecha). «Hecho» se queda.
 */
export function estadoTrasGuardar(actual: EstadoPlan, fecha: FechaDia | null): EstadoPlan {
  if (actual === 'hecho') return 'hecho'
  return fecha ? 'planeado' : 'idea'
}

export function validarValoracion(valor: string | number | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === '') return null
  const n = Number(valor)
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new ErrorDeValidacion('La valoración va del 1 al 5.')
  return n
}

export function validarComentario(texto: string): string {
  const limpio = texto.trim()
  if (limpio.length > COMENTARIO_MAX) throw new ErrorDeValidacion(`El comentario no puede tener más de ${COMENTARIO_MAX} caracteres.`)
  return limpio
}

export type Filtro<T extends string> = T | 'todos'

export function filtrarPlanes<P extends PlanBasico>(planes: readonly P[], estado: Filtro<EstadoPlan>, tipo: Filtro<TipoPlan>): P[] {
  return planes.filter((p) => (estado === 'todos' || p.estado === estado) && (tipo === 'todos' || p.tipo === tipo))
}

const ORDEN_ESTADO: Record<string, number> = { planeado: 0, idea: 1, hecho: 2 }

/**
 * Planeados primero (el más cercano antes), luego las ideas (la más nueva
 * antes) y al final los hechos (el más reciente antes).
 */
export function ordenarPlanes<P extends PlanBasico>(planes: readonly P[]): P[] {
  return [...planes].sort((a, b) => {
    const e = (ORDEN_ESTADO[a.estado] ?? 3) - (ORDEN_ESTADO[b.estado] ?? 3)
    if (e) return e
    if (a.estado === 'planeado') return (a.fecha ?? '').localeCompare(b.fecha ?? '') || a.titulo.localeCompare(b.titulo, 'es')
    if (a.estado === 'hecho') return (b.fecha ?? '').localeCompare(a.fecha ?? '') || b.created_at.localeCompare(a.created_at)
    return b.created_at.localeCompare(a.created_at)
  })
}

/** El próximo plan con fecha (de hoy en adelante y aún sin hacer), o null. */
export function proximoPlan<P extends PlanBasico>(planes: readonly P[], hoy: FechaDia): P | null {
  let mejor: P | null = null
  for (const p of planes) {
    if (p.estado === 'hecho' || !p.fecha || p.fecha < hoy) continue
    if (!mejor || p.fecha < mejor.fecha! || (p.fecha === mejor.fecha && p.titulo.localeCompare(mejor.titulo, 'es') < 0)) mejor = p
  }
  return mejor
}

/** "★★★☆☆" para mostrar una valoración (el número va aparte para lectores de pantalla). */
export function estrellas(valoracion: number): string {
  const n = Math.max(0, Math.min(5, Math.round(valoracion)))
  return '★'.repeat(n) + '☆'.repeat(5 - n)
}
