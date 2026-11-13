// Fechas de día ("AAAA-MM-DD") para hábitos, tareas, faltas y movimientos.
//
// Dos ideas para no equivocarse con las zonas horarias:
//  1. "Hoy" es el día que es AHORA en Madrid (da igual dónde esté el
//     dispositivo o cómo tenga puesto el reloj). Lo calcula Intl, que ya sabe
//     cuándo hay horario de verano.
//  2. Una fecha de día no es un instante. Para sumar días o formatearla se
//     pasa a medianoche UTC con Date.UTC y se opera SIEMPRE en UTC, donde
//     todos los días duran 24 h (no hay cambios de hora). Nunca se hace
//     `new Date('AAAA-MM-DD')` para luego leerla en hora local.

/** Fecha de día en formato AAAA-MM-DD. */
export type FechaDia = string

export const ZONA = 'Europe/Madrid'

const MS_DIA = 86_400_000
const FORMA = /^(\d{4})-(\d{2})-(\d{2})$/

const partesMadrid = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const formatoEs = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' })
const formatoDiaSemana = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', weekday: 'short' })
const formatoDiaSemanaLargo = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', weekday: 'long' })

const dos = (n: number) => String(n).padStart(2, '0')

/** Milisegundos (medianoche UTC) de una fecha de día. Lanza si no es válida. */
function aUTC(fecha: FechaDia): number {
  const m = FORMA.exec(fecha)
  if (!m) throw new RangeError(`Fecha de día no válida: ${String(fecha)}`)
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const ms = Date.UTC(anio, mes - 1, dia)
  const d = new Date(ms)
  // Date.UTC "corrige" el 31 de febrero al 3 de marzo: eso aquí es un error.
  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    throw new RangeError(`Fecha de día no válida: ${fecha}`)
  }
  return ms
}

function deUTC(ms: number): FechaDia {
  const d = new Date(ms)
  return `${String(d.getUTCFullYear()).padStart(4, '0')}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}`
}

/** ¿Es una cadena AAAA-MM-DD de un día que existe? */
export function esFechaDia(valor: unknown): valor is FechaDia {
  if (typeof valor !== 'string') return false
  try {
    aUTC(valor)
    return true
  } catch {
    return false
  }
}

/** Día que es en Madrid en el instante `instante` (por defecto, ahora). */
export function diaEnMadrid(instante: Date | string | number = new Date()): FechaDia {
  const d = instante instanceof Date ? instante : new Date(instante)
  if (Number.isNaN(d.getTime())) throw new RangeError('Instante no válido')
  let anio = ''
  let mes = ''
  let dia = ''
  for (const parte of partesMadrid.formatToParts(d)) {
    if (parte.type === 'year') anio = parte.value
    else if (parte.type === 'month') mes = parte.value
    else if (parte.type === 'day') dia = parte.value
  }
  return `${anio}-${mes}-${dia}`
}

/** "Hoy" en hora de Madrid. `ahora` solo se pasa en los tests. */
export function hoy(ahora: Date = new Date()): FechaDia {
  return diaEnMadrid(ahora)
}

/** Suma `dias` (puede ser negativo) a una fecha de día. */
export function sumarDias(fecha: FechaDia, dias: number): FechaDia {
  return deUTC(aUTC(fecha) + Math.trunc(dias) * MS_DIA)
}

/** Resta `dias` a una fecha de día. */
export function restarDias(fecha: FechaDia, dias: number): FechaDia {
  return sumarDias(fecha, -dias)
}

/** Días que van de `desde` a `hasta` (positivo si `hasta` es posterior). */
export function diferenciaDias(desde: FechaDia, hasta: FechaDia): number {
  return Math.round((aUTC(hasta) - aUTC(desde)) / MS_DIA)
}

/** Los últimos `n` días acabando en `hasta` (incluido), del más antiguo al más reciente. */
export function ultimosDias(n: number, hasta: FechaDia = hoy()): FechaDia[] {
  const total = Math.max(0, Math.trunc(n))
  const fin = aUTC(hasta)
  return Array.from({ length: total }, (_, i) => deUTC(fin - (total - 1 - i) * MS_DIA))
}

/** "13/11/2026" */
export function formatearFecha(fecha: FechaDia): string {
  return formatoEs.format(aUTC(fecha))
}

/** Nombre corto del día de la semana, en minúsculas y sin punto: "lun", "mar", "mié"… */
export function diaSemanaCorto(fecha: FechaDia): string {
  return formatoDiaSemana.format(aUTC(fecha)).replace(/\./g, '')
}

/** Nombre completo del día de la semana: "lunes", "martes"… (para lectores de pantalla). */
export function diaSemanaLargo(fecha: FechaDia): string {
  return formatoDiaSemanaLargo.format(aUTC(fecha))
}

/** Número del día del mes (1-31), para las cabeceras de la cuadrícula. */
export function diaDelMes(fecha: FechaDia): number {
  return new Date(aUTC(fecha)).getUTCDate()
}
