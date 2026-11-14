// Movimientos fijos: un gasto (o ingreso) que se repite cada mes el mismo día
// (gimnasio, Spotify, la paga…). La app apunta sola el movimiento de cada mes
// cuando llega su día. Lógica pura, sin React ni Supabase.
//
// Para que dos dispositivos no lo apunten dos veces, el movimiento de cada mes
// tiene un id DETERMINISTA (idApunteFijo): si los dos lo crean, es la misma
// fila. `ultimo_mes` guarda el último mes ya apuntado, para no volver a
// apuntar uno que el usuario haya borrado a propósito.

import { mesDe, sumarMeses, type Mes } from './dinero'
import { type FechaDia } from './fechas'
import { uuidV5 } from './uuid'
import { ErrorDeValidacion } from './validacion'

export interface FijoBasico {
  id: string
  dia: number
  desde: Mes
  ultimo_mes: Mes | null
  activo: boolean
}

/** Días que tiene un mes AAAA-MM. */
export function diasDelMes(mes: Mes): number {
  const [a, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(a, m, 0)).getUTCDate()
}

/** Fecha en que toca un fijo un mes: el día `dia`, o el último si el mes es más corto. */
export function fechaEnMes(mes: Mes, dia: number): FechaDia {
  return `${mes}-${String(Math.min(dia, diasDelMes(mes))).padStart(2, '0')}`
}

/**
 * Primer mes de un fijo nuevo: este mes si su día aún no ha pasado (o es
 * hoy); si ya pasó, el que viene (lo de este mes seguramente ya está apuntado a mano).
 */
export function mesInicial(dia: number, hoy: FechaDia): Mes {
  const mes = mesDe(hoy)
  return fechaEnMes(mes, dia) >= hoy ? mes : sumarMeses(mes, 1)
}

/** Máximo de meses que se ponen al día de una vez (por si la app lleva mucho sin abrirse). */
export const MAX_MESES_PENDIENTES = 12

/**
 * Meses que hay que apuntar ya: desde el siguiente a `ultimo_mes` (o desde
 * `desde`) hasta hoy, solo si su día ya ha llegado. Como mucho los
 * `MAX_MESES_PENDIENTES` más recientes.
 */
export function mesesPendientes(fijo: FijoBasico, hoy: FechaDia): Mes[] {
  if (!fijo.activo) return []
  let mes = fijo.ultimo_mes && fijo.ultimo_mes >= fijo.desde ? sumarMeses(fijo.ultimo_mes, 1) : fijo.desde
  const limite = sumarMeses(mesDe(hoy), -(MAX_MESES_PENDIENTES - 1))
  if (mes < limite) mes = limite
  const meses: Mes[] = []
  while (mes <= mesDe(hoy) && fechaEnMes(mes, fijo.dia) <= hoy) {
    meses.push(mes)
    mes = sumarMeses(mes, 1)
  }
  return meses
}

/**
 * Id del movimiento de un fijo en un mes: UUID v5 con el id del fijo como
 * espacio y el mes como nombre. TODOS los dispositivos deben calcularlo igual:
 * no cambiar esta fórmula una vez haya datos.
 */
export function idApunteFijo(fijoId: string, mes: Mes): string {
  return uuidV5(`fijo:${mes}`, fijoId.toLowerCase())
}

/** Próxima fecha en que se apuntará (null si está en pausa). */
export function proximoApunte(fijo: FijoBasico, hoy: FechaDia): FechaDia | null {
  if (!fijo.activo) return null
  let mes = fijo.ultimo_mes && fijo.ultimo_mes >= fijo.desde ? sumarMeses(fijo.ultimo_mes, 1) : fijo.desde
  if (mes < mesDe(hoy)) mes = mesDe(hoy)
  const fecha = fechaEnMes(mes, fijo.dia)
  return fecha >= hoy ? fecha : fechaEnMes(sumarMeses(mes, 1), fijo.dia)
}

/** Al reanudar un fijo en pausa, no se apuntan los meses que estuvo parado. */
export function desdeAlReanudar(fijo: FijoBasico, hoy: FechaDia): Mes {
  const inicial = mesInicial(fijo.dia, hoy)
  return fijo.desde > inicial ? fijo.desde : inicial
}

export function validarDia(texto: string | number): number {
  const dia = typeof texto === 'number' ? texto : Number(String(texto).trim())
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) throw new ErrorDeValidacion('El día tiene que ser un número del 1 al 31.')
  return dia
}
