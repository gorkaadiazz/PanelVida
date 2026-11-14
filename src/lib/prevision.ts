// Previsión de ahorro (sin IA): el ritmo al que ahorras de verdad y hasta
// dónde llegas a ese ritmo. Lógica pura, importes en céntimos.
//
// RITMO (céntimos al mes) = media de lo apuntado a mano en la ventana elegida
// (ingresos − gastos de los últimos 1, 3 o 6 meses, pasado a «por mes») +
// los fijos activos tal como están HOY (ingresos fijos − gastos fijos, en su
// equivalente al mes). Los apuntes de los fijos no entran en la media: así no
// se cuentan dos veces y un fijo dado de baja deja de restar.

import { formatearEuros, mesDe, resumir, sumarMeses, type MovimientoBasico } from './dinero'
import { ordenarDeseos, type DeseoBasico } from './deseos'
import { diferenciaDias, formatearFecha, sumarDias, type FechaDia } from './fechas'
import { esDeFijo, fechaEnMes, totalFijoMensual } from './fijos'

export const VENTANAS = [1, 3, 6] as const
export type Ventana = (typeof VENTANAS)[number]
export const VENTANA_POR_DEFECTO: Ventana = 3

/** Días que tiene un mes de media (365 / 12). */
export const DIAS_POR_MES = 365 / 12
/** Con menos días de datos, el ritmo se avisa como poco fiable. */
export const DIAS_MIN_DATOS = 30
/** Más allá de esto (50 años) no se da fecha: a efectos prácticos no llegas. */
export const DIAS_MAX_LLEGADA = 365 * 50
/** Plazos para «cuánto tendrías que ahorrar al mes» cuando a este ritmo no llegas. */
export const PLAZOS_NECESARIO = [3, 6, 12] as const

export const esVentana = (v: unknown): v is Ventana => (VENTANAS as readonly unknown[]).includes(v)

export interface MovimientoPrevision extends MovimientoBasico {
  id: string
  fijo_id?: string | null
}

export interface FijoPrevision {
  id: string
  tipo: string
  importe_centimos: number
  frecuencia?: string | null
  activo: boolean
}

export interface Ritmo {
  /** Céntimos al mes (ingresos − gastos). Puede ser negativo. */
  mensual: number
  /** Parte de lo apuntado a mano (media de la ventana). */
  variable: number
  /** Ingresos fijos − gastos fijos activos, al mes. */
  fijos: number
  /** Días de datos que se han usado (0 si no hay ninguno). */
  dias: number
  /** Primer día que se ha tenido en cuenta. */
  desde: FechaDia | null
  aviso: 'sin_datos' | 'pocos_datos' | null
}

/** La misma fecha `n` meses después (o antes): el 31 en un mes de 30 cae el 30. */
export function sumarMesesAFecha(fecha: FechaDia, n: number): FechaDia {
  return fechaEnMes(sumarMeses(mesDe(fecha), n), Number(fecha.slice(8, 10)))
}

function conSigno(m: MovimientoBasico): number {
  return m.tipo === 'ingreso' ? m.importe_centimos : m.tipo === 'gasto' ? -m.importe_centimos : 0
}

/** Ritmo de ahorro con la ventana de `meses` meses que acaba hoy. */
export function ritmoAhorro(movimientos: readonly MovimientoPrevision[], fijos: readonly FijoPrevision[], meses: number, hoy: FechaDia): Ritmo {
  const deFijos = totalFijoMensual(fijos, 'ingreso') - totalFijoMensual(fijos, 'gasto')
  const pasados = movimientos.filter((m) => m.fecha <= hoy)
  if (pasados.length === 0) return { mensual: deFijos, variable: 0, fijos: deFijos, dias: 0, desde: null, aviso: 'sin_datos' }

  const inicioVentana = sumarDias(sumarMesesAFecha(hoy, -meses), 1)
  const primero = pasados.reduce((min, m) => (m.fecha < min ? m.fecha : min), pasados[0].fecha)
  const desde = primero > inicioVentana ? primero : inicioVentana
  const dias = diferenciaDias(desde, hoy) + 1

  let neto = 0
  for (const m of pasados) if (m.fecha >= desde && !esDeFijo(m, fijos)) neto += conSigno(m)
  const variable = Math.round((neto * 365) / (12 * dias))
  return { mensual: variable + deFijos, variable, fijos: deFijos, dias, desde, aviso: dias < DIAS_MIN_DATOS ? 'pocos_datos' : null }
}

/** Ahorro total que tendrías dentro de `dias` días a este ritmo. */
export function saldoDentroDe(saldo: number, ritmo: number, dias: number): number {
  return saldo + Math.round((ritmo * 12 * Math.max(0, dias)) / 365)
}

/** Ahorro total que tendrías en una fecha (hoy o después). */
export function saldoEn(saldo: number, ritmo: number, hoy: FechaDia, fecha: FechaDia): number {
  return saldoDentroDe(saldo, ritmo, diferenciaDias(hoy, fecha))
}

export type Llegada =
  | { estado: 'ya' }
  | { estado: 'llega'; dias: number; fecha: FechaDia }
  /** `lejos`: el ritmo es positivo pero tardarías más de 50 años. */
  | { estado: 'no_llega'; motivo: 'ritmo' | 'lejos'; falta: number; necesario: { meses: number; alMes: number }[] }

/** ¿Cuándo llego a `objetivo` con el ahorro de hoy y este ritmo? */
export function cuandoLlego(saldo: number, objetivo: number, ritmo: number, hoy: FechaDia): Llegada {
  const falta = objetivo - saldo
  if (falta <= 0) return { estado: 'ya' }
  // En enteros (× 365 ÷ 12) para que el redondeo sea exacto
  const dias = ritmo > 0 ? Math.ceil((falta * 365) / (12 * ritmo)) : Infinity
  if (dias > DIAS_MAX_LLEGADA) {
    return {
      estado: 'no_llega',
      motivo: ritmo > 0 ? 'lejos' : 'ritmo',
      falta,
      necesario: PLAZOS_NECESARIO.map((meses) => ({ meses, alMes: Math.ceil(falta / meses) })),
    }
  }
  return { estado: 'llega', dias, fecha: sumarDias(hoy, dias) }
}

export type Impacto =
  /** Llegas a la meta `dias` días antes. */
  | { tipo: 'antes'; dias: number }
  /** A tu ritmo no llegabas; con el recorte sí (en esa fecha). */
  | { tipo: 'desbloquea'; fecha: FechaDia }
  | null

/** Qué cambia en la meta si ahorras `extra` céntimos más al mes. */
export function impactoEnMeta(saldo: number, meta: number | null, ritmo: number, extra: number, hoy: FechaDia): Impacto {
  if (meta === null || extra <= 0) return null
  const antes = cuandoLlego(saldo, meta, ritmo, hoy)
  const despues = cuandoLlego(saldo, meta, ritmo + extra, hoy)
  if (despues.estado !== 'llega') return null
  if (antes.estado === 'no_llega') return { tipo: 'desbloquea', fecha: despues.fecha }
  if (antes.estado !== 'llega') return null
  const dias = antes.dias - despues.dias
  return dias > 0 ? { tipo: 'antes', dias } : null
}

/** "1 día", "5 días", "3 semanas", "4 meses", "2 años". */
export function textoDuracion(dias: number): string {
  const d = Math.max(0, Math.round(dias))
  if (d < 14) return `${d} ${d === 1 ? 'día' : 'días'}`
  if (d < 60) return `${Math.round(d / 7)} semanas`
  if (d < 730) {
    const meses = Math.round(d / DIAS_POR_MES)
    return `${meses} ${meses === 1 ? 'mes' : 'meses'}`
  }
  const anios = Math.round(d / 365)
  return `${anios} años`
}

/** "llegas a la meta 3 semanas antes" / "empiezas a acercarte a la meta (llegarías el 15/05/2027)" / null. */
export function textoImpacto(impacto: Impacto): string | null {
  if (!impacto) return null
  if (impacto.tipo === 'antes') return `llegas a la meta ${textoDuracion(impacto.dias)} antes`
  return `empiezas a acercarte a la meta (llegarías el ${formatearFecha(impacto.fecha)})`
}

// --- Serie para la gráfica ----------------------------------------------------

export interface Punto {
  fecha: FechaDia
  /** Ahorro total acumulado (céntimos). */
  saldo: number
}

/**
 * Evolución real del ahorro total: al final de cada uno de los últimos
 * `meses` meses y hoy. Lo de después de hoy (movimientos con fecha futura) no cuenta.
 */
export function serieReal(movimientos: readonly MovimientoBasico[], hoy: FechaDia, meses: number = 6): Punto[] {
  const ordenados = movimientos.filter((m) => m.fecha <= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha))
  const fechas: FechaDia[] = []
  for (let i = meses; i >= 1; i--) fechas.push(fechaEnMes(sumarMeses(mesDe(hoy), -i), 31))
  fechas.push(hoy)
  let saldo = 0
  let j = 0
  return fechas.map((fecha) => {
    while (j < ordenados.length && ordenados[j].fecha <= fecha) saldo += conSigno(ordenados[j++])
    return { fecha, saldo }
  })
}

/** Proyección desde hoy: un punto por mes durante `meses` meses. */
export function serieProyeccion(saldo: number, ritmo: number, hoy: FechaDia, meses: number): Punto[] {
  const puntos: Punto[] = [{ fecha: hoy, saldo }]
  for (let i = 1; i <= meses; i++) {
    const fecha = sumarMesesAFecha(hoy, i)
    puntos.push({ fecha, saldo: saldoEn(saldo, ritmo, hoy, fecha) })
  }
  return puntos
}

/** Ahorro total de hoy: lo mismo que la tarjeta «Ahorro total» de Dinero. */
export function ahorroTotal(movimientos: readonly MovimientoBasico[]): number {
  return resumir(movimientos).ahorro
}

// --- Objetivos y textos ---------------------------------------------------------

/**
 * Cantidad a la que hay que llegar para un deseo: su precio más el de los
 * pendientes que van antes por prioridad (el ahorro se reparte en ese orden,
 * como en la lista de deseos). null si no está pendiente.
 */
export function objetivoDeseo(deseos: readonly DeseoBasico[], id: string): number | null {
  const orden = ordenarDeseos(deseos)
  const i = orden.findIndex((d) => d.id === id)
  if (i < 0) return null
  return orden.slice(0, i + 1).reduce((s, d) => s + d.precio_centimos, 0)
}

const formatoDiaMes = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' })
const formatoDiaMesAnio = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/** "15 de mayo" (este año) o "15 de mayo de 2027". */
export function textoFecha(fecha: FechaDia, hoy: FechaDia): string {
  const instante = Date.parse(`${fecha}T00:00:00Z`)
  return fecha.slice(0, 4) === hoy.slice(0, 4) ? formatoDiaMes.format(instante) : formatoDiaMesAnio.format(instante)
}

/** "+120,00 €/mes" / "−30,00 €/mes" / "0,00 €/mes". */
export function textoRitmo(ritmo: number): string {
  return `${ritmo > 0 ? '+' : ''}${formatearEuros(ritmo)}/mes`
}

/**
 * Respuesta a «¿cuándo llego?», sin inventar fechas:
 *  · "Ya lo tienes."
 *  · "A este ritmo llegas el 15 de mayo de 2027 (en 6 meses)."
 *  · "A este ritmo no llegas. Para llegar tendrías que ahorrar 300,00 €/mes en 3 meses, 150,00 € en 6 o 75,00 € en 12."
 */
export function textoLlegada(llegada: Llegada, hoy: FechaDia): string {
  if (llegada.estado === 'ya') return 'Ya lo tienes.'
  if (llegada.estado === 'llega') return `A este ritmo llegas el ${textoFecha(llegada.fecha, hoy)} (en ${textoDuracion(llegada.dias)}).`
  const [a, b, c] = llegada.necesario
  const motivo = llegada.motivo === 'lejos' ? 'A este ritmo tardarías más de 50 años.' : 'A este ritmo no llegas.'
  return `${motivo} Para llegar tendrías que ahorrar ${formatearEuros(a.alMes)}/mes en ${a.meses} meses, ${formatearEuros(b.alMes)} en ${b.meses} o ${formatearEuros(c.alMes)} en ${c.meses}.`
}

/** Línea de Inicio: "A este ritmo llegas a tu meta el 15 de mayo" (null si no hay meta o ya está). */
export function lineaMeta(llegada: Llegada | null, hoy: FechaDia): string | null {
  if (!llegada || llegada.estado === 'ya') return null
  if (llegada.estado === 'llega') return `A este ritmo llegas a tu meta el ${textoFecha(llegada.fecha, hoy)}`
  return 'A este ritmo no llegas a tu meta'
}
