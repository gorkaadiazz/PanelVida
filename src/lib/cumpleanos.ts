// Cumpleaños: próxima fecha, cuenta atrás y edad. Lógica pura.
//
// El 29 de febrero, en los años que no son bisiestos, se celebra el 28.

import { diferenciaDias, type FechaDia } from './fechas'
import { ErrorDeValidacion } from './validacion'

export { ErrorDeValidacion }

export const NOMBRE_CUMPLE_MAX = 80
export const NOTAS_CUMPLE_MAX = 500
export const DIAS_EN_INICIO = 7

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] as const

export interface CumpleBasico {
  id: string
  nombre: string
  dia: number
  mes: number
  anio: number | null
}

export interface ProximoCumple<C extends CumpleBasico = CumpleBasico> {
  cumple: C
  /** Fecha en que se celebra (este año o el que viene). */
  fecha: FechaDia
  /** Días que faltan (0 = hoy). */
  dias: number
  /** Años que cumple, si se sabe el año de nacimiento. */
  edad: number | null
}

export function esBisiesto(anio: number): boolean {
  return anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0)
}

/** Días máximos de un mes contando el 29 de febrero (para validar el día). */
export function diasMaximos(mes: number): number {
  return [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1] ?? 0
}

const dos = (n: number) => String(n).padStart(2, '0')

/** Fecha del cumpleaños en un año concreto (29/2 → 28/2 si no es bisiesto). */
export function fechaEnAnio(dia: number, mes: number, anio: number): FechaDia {
  const d = mes === 2 && dia === 29 && !esBisiesto(anio) ? 28 : dia
  return `${String(anio).padStart(4, '0')}-${dos(mes)}-${dos(d)}`
}

export function proximo<C extends CumpleBasico>(cumple: C, hoy: FechaDia): ProximoCumple<C> {
  const anioHoy = Number(hoy.slice(0, 4))
  let anio = anioHoy
  let fecha = fechaEnAnio(cumple.dia, cumple.mes, anio)
  if (fecha < hoy) fecha = fechaEnAnio(cumple.dia, cumple.mes, ++anio)
  const edad = cumple.anio && cumple.anio <= anio ? anio - cumple.anio : null
  return { cumple, fecha, dias: diferenciaDias(hoy, fecha), edad }
}

/** Todos, del más cercano al más lejano (empate: por nombre). */
export function ordenarPorProximo<C extends CumpleBasico>(cumples: readonly C[], hoy: FechaDia): ProximoCumple<C>[] {
  return cumples.map((c) => proximo(c, hoy)).sort((a, b) => a.dias - b.dias || a.cumple.nombre.localeCompare(b.cumple.nombre, 'es'))
}

/** Los de hoy hasta dentro de `dias` días (para Inicio). */
export function proximosDias<C extends CumpleBasico>(cumples: readonly C[], hoy: FechaDia, dias = DIAS_EN_INICIO): ProximoCumple<C>[] {
  return ordenarPorProximo(cumples, hoy).filter((p) => p.dias <= dias)
}

/** "hoy", "mañana", "en 5 días". */
export function textoCuentaAtras(dias: number): string {
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'mañana'
  return `en ${dias} días`
}

/** "14 de noviembre" */
export function textoDiaMes(dia: number, mes: number): string {
  return `${dia} de ${MESES[mes - 1] ?? '?'}`
}

export interface DatosCumpleTexto {
  nombre: string
  dia: string
  mes: string
  /** '' = sin año. */
  anio: string
  notas: string
}

export function validarCumple(datos: DatosCumpleTexto, hoy: FechaDia): { nombre: string; dia: number; mes: number; anio: number | null; notas: string } {
  const nombre = datos.nombre.trim().replace(/\s+/g, ' ')
  if (!nombre) throw new ErrorDeValidacion('Escribe el nombre.')
  if (nombre.length > NOMBRE_CUMPLE_MAX) throw new ErrorDeValidacion(`El nombre no puede tener más de ${NOMBRE_CUMPLE_MAX} caracteres.`)
  const mes = Number(datos.mes)
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) throw new ErrorDeValidacion('Elige el mes.')
  const dia = Number(datos.dia)
  if (!Number.isInteger(dia) || dia < 1 || dia > diasMaximos(mes)) throw new ErrorDeValidacion(`Ese día no existe en ${MESES[mes - 1]}.`)
  let anio: number | null = null
  if (datos.anio.trim()) {
    anio = Number(datos.anio.trim())
    const anioHoy = Number(hoy.slice(0, 4))
    if (!Number.isInteger(anio) || anio < 1900 || anio > anioHoy) throw new ErrorDeValidacion(`El año tiene que estar entre 1900 y ${anioHoy}.`)
    if (mes === 2 && dia === 29 && !esBisiesto(anio)) throw new ErrorDeValidacion(`${anio} no fue bisiesto: no tuvo 29 de febrero.`)
  }
  const notas = datos.notas.trim()
  if (notas.length > NOTAS_CUMPLE_MAX) throw new ErrorDeValidacion(`Las notas no pueden tener más de ${NOTAS_CUMPLE_MAX} caracteres.`)
  return { nombre, dia, mes, anio, notas }
}
