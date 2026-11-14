// Resumen de la semana para Inicio: esta semana (de lunes a hoy) frente a los
// MISMOS días de la semana pasada, para que la comparación sea justa (un
// miércoles no se compara con una semana entera). Lógica pura.

import { resumir, type MovimientoBasico } from './dinero'
import { diaEnMadrid, diferenciaDias, restarDias, type FechaDia } from './fechas'
import { habitosActivos, type HabitoBasico, type MarcaBasica } from './habitos'

export interface TareaHecha {
  hecha: boolean
  /** Instante ISO en que se marcó como hecha. */
  hecha_en: string | null
}

export interface CifrasSemana {
  /** Marcas de hábitos activos hechas en esos días. */
  habitosHechos: number
  /** Hábitos activos × días: lo máximo que se podía marcar. */
  habitosPosibles: number
  tareasHechas: number
  /** Ingresos − gastos de esos días (céntimos). */
  ahorro: number
}

export interface ResumenSemana {
  /** Lunes de esta semana. */
  desde: FechaDia
  /** Días contados (1 el lunes, 7 el domingo). */
  dias: number
  actual: CifrasSemana
  anterior: CifrasSemana
}

/** Lunes de la semana de una fecha (la semana empieza en lunes, como en España). */
export function lunesDe(fecha: FechaDia): FechaDia {
  const domingo0 = new Date(`${fecha}T00:00:00Z`).getUTCDay() // 0 = domingo
  return restarDias(fecha, (domingo0 + 6) % 7)
}

function enRango(fecha: FechaDia, desde: FechaDia, hasta: FechaDia): boolean {
  return fecha >= desde && fecha <= hasta
}

function cifras(
  desde: FechaDia,
  hasta: FechaDia,
  habitos: readonly HabitoBasico[],
  marcas: readonly MarcaBasica[],
  tareas: readonly TareaHecha[],
  movimientos: readonly MovimientoBasico[],
): CifrasSemana {
  const activos = new Set(habitosActivos(habitos).map((h) => h.id))
  const dias = diferenciaDias(desde, hasta) + 1
  return {
    habitosHechos: marcas.filter((m) => m.hecho && activos.has(m.habito_id) && enRango(m.fecha, desde, hasta)).length,
    habitosPosibles: activos.size * dias,
    tareasHechas: tareas.filter((t) => {
      if (!t.hecha || !t.hecha_en) return false
      try {
        return enRango(diaEnMadrid(t.hecha_en), desde, hasta)
      } catch {
        return false // instante corrupto: no cuenta
      }
    }).length,
    ahorro: resumir(movimientos.filter((m) => enRango(m.fecha, desde, hasta))).ahorro,
  }
}

export function resumenSemana(
  datos: {
    habitos: readonly HabitoBasico[]
    marcas: readonly MarcaBasica[]
    tareas: readonly TareaHecha[]
    movimientos: readonly MovimientoBasico[]
  },
  hoy: FechaDia,
): ResumenSemana {
  const desde = lunesDe(hoy)
  const dias = diferenciaDias(desde, hoy) + 1
  const { habitos, marcas, tareas, movimientos } = datos
  return {
    desde,
    dias,
    actual: cifras(desde, hoy, habitos, marcas, tareas, movimientos),
    anterior: cifras(restarDias(desde, 7), restarDias(hoy, 7), habitos, marcas, tareas, movimientos),
  }
}

/** Porcentaje entero (0 si no había nada que hacer). */
export function porcentaje(hechos: number, posibles: number): number {
  return posibles > 0 ? Math.round((hechos * 100) / posibles) : 0
}

/**
 * Comparación en palabras: «3 más que la semana pasada», «igual que…»,
 * «2 menos que…». `formatear` da forma a la cifra (p. ej. euros).
 */
export function textoComparacion(actual: number, anterior: number, formatear: (n: number) => string = String): string {
  const diferencia = actual - anterior
  if (diferencia === 0) return 'igual que la semana pasada'
  return `${formatear(Math.abs(diferencia))} ${diferencia > 0 ? 'más' : 'menos'} que la semana pasada`
}
