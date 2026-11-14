// Movimientos fijos: un gasto (o ingreso) que se repite cada día, semana, mes
// o año (café, clases, gimnasio, Spotify, seguro, la paga…). La app apunta
// sola el movimiento cuando le toca. Lógica pura, sin React ni Supabase.
//
// Cada frecuencia se reparte en PERIODOS y se apunta uno por periodo:
//  · mensual: el mes (AAAA-MM), el día `dia` (o el último si el mes es más corto).
//  · anual:   el año (AAAA), el día `dia` del mes `mes` (29/2 → 28 en años no bisiestos).
//  · semanal: la semana (su lunes), el día de la semana `dia` (1 = lunes … 7 = domingo).
//  · diaria:  la semana (su lunes): UN apunte el domingo con el importe por
//             los días de esa semana en que estaba activo (para no llenar la
//             lista con 365 apuntes al año).
//
// Para que dos dispositivos no apunten lo mismo dos veces, el movimiento de
// cada periodo tiene un id DETERMINISTA (idApunteFijo). `ultimo_apunte` es la
// fecha del último apunte hecho: el siguiente es el del periodo de después
// (así no se repite uno que el usuario haya borrado a propósito).
//
// Compatibilidad: antes solo había fijos mensuales, con `desde` y `ultimo_mes`
// (meses AAAA-MM). Una fila que aún no tiene las columnas nuevas se lee con
// `normalizarFijo`, y al guardar se rellenan también las antiguas
// (`camposAntiguos`) para la app sin actualizar de otros dispositivos.

import { mesDe, sumarMeses, IMPORTE_MAX_CENTIMOS, type Mes } from './dinero'
import { diferenciaDias, sumarDias, type FechaDia } from './fechas'
import { lunesDe } from './semana'
import { esUuid, uuidV5 } from './uuid'
import { ErrorDeValidacion } from './validacion'

export const FRECUENCIAS = ['diaria', 'semanal', 'mensual', 'anual'] as const
export type Frecuencia = (typeof FRECUENCIAS)[number]

export const NOMBRE_FRECUENCIA: Record<Frecuencia, string> = {
  diaria: 'Cada día',
  semanal: 'Cada semana',
  mensual: 'Cada mes',
  anual: 'Cada año',
}

/** Unidad corta para los importes: "1,50 €/día". */
export const UNIDAD_FRECUENCIA: Record<Frecuencia, string> = { diaria: 'día', semanal: 'semana', mensual: 'mes', anual: 'año' }

export const esFrecuencia = (v: unknown): v is Frecuencia => typeof v === 'string' && (FRECUENCIAS as readonly string[]).includes(v)

export const DIAS_SEMANA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const

/** `desde` que se guarda en los fijos no mensuales: la app antigua nunca los apunta. */
export const DESDE_NUNCA: Mes = '9999-12'

export interface FijoBasico {
  id: string
  dia: number
  desde: Mes
  ultimo_mes: Mes | null
  activo: boolean
  frecuencia?: string | null
  mes?: number | null
  inicio?: FechaDia | null
  ultimo_apunte?: FechaDia | null
}

/** Un fijo con las columnas nuevas siempre puestas. */
export interface FijoNormal {
  id: string
  frecuencia: Frecuencia
  dia: number
  mes: number | null
  inicio: FechaDia
  ultimo_apunte: FechaDia | null
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

/** Lee un fijo aunque venga de antes de las frecuencias (sin inicio ni ultimo_apunte). */
export function normalizarFijo(f: FijoBasico): FijoNormal {
  const frecuencia = esFrecuencia(f.frecuencia) ? f.frecuencia : 'mensual'
  return {
    id: f.id,
    frecuencia,
    dia: f.dia,
    mes: frecuencia === 'anual' ? (f.mes ?? 1) : null,
    inicio: f.inicio ?? `${f.desde}-01`,
    ultimo_apunte: f.ultimo_apunte !== undefined ? f.ultimo_apunte : f.ultimo_mes ? fechaEnMes(f.ultimo_mes, f.dia) : null,
    activo: f.activo,
  }
}

// --- Periodos ---------------------------------------------------------------

/** Periodo al que pertenece una fecha: AAAA-MM, AAAA o el lunes de la semana. */
export function periodoDe(frecuencia: Frecuencia, fecha: FechaDia): string {
  if (frecuencia === 'mensual') return mesDe(fecha)
  if (frecuencia === 'anual') return fecha.slice(0, 4)
  return lunesDe(fecha)
}

function siguientePeriodo(frecuencia: Frecuencia, periodo: string): string {
  if (frecuencia === 'mensual') return sumarMeses(periodo, 1)
  if (frecuencia === 'anual') return String(Number(periodo) + 1).padStart(4, '0')
  return sumarDias(periodo, 7)
}

/** Fecha en que toca el apunte de un periodo. */
function fechaDelPeriodo(f: FijoNormal, periodo: string): FechaDia {
  switch (f.frecuencia) {
    case 'mensual':
      return fechaEnMes(periodo, f.dia)
    case 'anual':
      return fechaEnMes(`${periodo}-${String(f.mes ?? 1).padStart(2, '0')}`, f.dia)
    case 'semanal':
      return sumarDias(periodo, Math.min(Math.max(f.dia, 1), 7) - 1)
    case 'diaria':
      return sumarDias(periodo, 6) // el domingo
  }
}

/** Máximo que se pone al día de una vez (por si la app lleva mucho sin abrirse). */
export const MAX_MESES_PENDIENTES = 12
export const MAX_SEMANAS_PENDIENTES = 52
export const MAX_ANIOS_PENDIENTES = 2

/** Primer periodo que se llega a poner al día. */
function periodoLimite(frecuencia: Frecuencia, hoy: FechaDia): string {
  if (frecuencia === 'mensual') return sumarMeses(mesDe(hoy), -(MAX_MESES_PENDIENTES - 1))
  if (frecuencia === 'anual') return String(Number(hoy.slice(0, 4)) - (MAX_ANIOS_PENDIENTES - 1))
  return sumarDias(lunesDe(hoy), -7 * (MAX_SEMANAS_PENDIENTES - 1))
}

/** Un apunte que toca hacer: su periodo (forma parte del id), su fecha y por cuántos días (diaria). */
export interface Apunte {
  periodo: string
  fecha: FechaDia
  /** Veces que se cobra el importe: 1, o los días de la semana en los fijos diarios. */
  veces: number
}

function apunteDe(f: FijoNormal, periodo: string): Apunte {
  const fecha = fechaDelPeriodo(f, periodo)
  if (f.frecuencia !== 'diaria') return { periodo, fecha, veces: 1 }
  const desde = f.inicio > periodo ? f.inicio : periodo
  return { periodo, fecha, veces: Math.max(0, diferenciaDias(desde, fecha) + 1) }
}

/** Primer periodo que aún no está apuntado (o el del inicio). */
function primerPeriodo(f: FijoNormal): string {
  const delInicio = periodoDe(f.frecuencia, f.inicio)
  if (!f.ultimo_apunte) return delInicio
  const siguiente = siguientePeriodo(f.frecuencia, periodoDe(f.frecuencia, f.ultimo_apunte))
  return siguiente > delInicio ? siguiente : delInicio
}

/** ¿Este periodo cuenta? Solo si su fecha no es anterior al inicio. */
const cuenta = (f: FijoNormal, a: Apunte) => a.fecha >= f.inicio && a.veces > 0

/**
 * Apuntes que hay que hacer ya: desde el periodo siguiente al último apuntado
 * (o desde el inicio) hasta hoy, solo los que ya han llegado a su día. Como
 * mucho los de los últimos 12 meses, 52 semanas o 2 años.
 */
export function apuntesPendientes(fijo: FijoBasico, hoy: FechaDia): Apunte[] {
  const f = normalizarFijo(fijo)
  if (!f.activo) return []
  let periodo = primerPeriodo(f)
  const limite = periodoLimite(f.frecuencia, hoy)
  if (periodo < limite) periodo = limite
  const apuntes: Apunte[] = []
  const ultimo = periodoDe(f.frecuencia, hoy)
  while (periodo <= ultimo) {
    const a = apunteDe(f, periodo)
    if (a.fecha > hoy) break
    if (cuenta(f, a)) apuntes.push(a)
    periodo = siguientePeriodo(f.frecuencia, periodo)
  }
  return apuntes
}

/** Meses pendientes de un fijo mensual (los periodos de `apuntesPendientes`). */
export function mesesPendientes(fijo: FijoBasico, hoy: FechaDia): Mes[] {
  return apuntesPendientes(fijo, hoy).map((a) => a.periodo)
}

/**
 * Id del movimiento de un fijo en un periodo: UUID v5 con el id del fijo como
 * espacio y el periodo como nombre. TODOS los dispositivos deben calcularlo
 * igual: no cambiar esta fórmula una vez haya datos. Los mensuales conservan
 * la de siempre (`fijo:AAAA-MM`); la diaria lleva una marca para no chocar
 * con la semanal si se cambia la frecuencia.
 */
export function idApunteFijo(fijoId: string, periodo: string, frecuencia: Frecuencia = 'mensual'): string {
  const nombre = frecuencia === 'diaria' ? `fijo:d:${periodo}` : `fijo:${periodo}`
  return uuidV5(nombre, fijoId.toLowerCase())
}

/** Próxima fecha en que se apuntará (null si está en pausa). */
export function proximoApunte(fijo: FijoBasico, hoy: FechaDia): FechaDia | null {
  const f = normalizarFijo(fijo)
  if (!f.activo) return null
  let periodo = primerPeriodo(f)
  const deHoy = periodoDe(f.frecuencia, hoy)
  if (periodo < deHoy) periodo = deHoy
  // Como mucho hacen falta dos vueltas (el periodo de hoy ya pasado → el siguiente)
  for (let i = 0; i < 3; i++) {
    const a = apunteDe(f, periodo)
    if (a.fecha >= hoy && cuenta(f, a)) return a.fecha
    periodo = siguientePeriodo(f.frecuencia, periodo)
  }
  return apunteDe(f, periodo).fecha
}

// --- Compatibilidad con los campos antiguos (meses) --------------------------

/**
 * Primer mes de un fijo mensual nuevo: este mes si su día aún no ha pasado (o
 * es hoy); si ya pasó, el que viene (lo de este mes seguramente ya está apuntado a mano).
 */
export function mesInicial(dia: number, hoy: FechaDia): Mes {
  const mes = mesDe(hoy)
  return fechaEnMes(mes, dia) >= hoy ? mes : sumarMeses(mes, 1)
}

/** Al reanudar un fijo mensual en pausa, no se apuntan los meses que estuvo parado. */
export function desdeAlReanudar(fijo: FijoBasico, hoy: FechaDia): Mes {
  const inicial = mesInicial(fijo.dia, hoy)
  return fijo.desde > inicial ? fijo.desde : inicial
}

/** Inicio al reanudar: hoy (lo que tocó durante la pausa no se apunta). */
export function inicioAlReanudar(fijo: FijoBasico, hoy: FechaDia): FechaDia {
  const { inicio } = normalizarFijo(fijo)
  return inicio > hoy ? inicio : hoy
}

/**
 * `desde` y `ultimo_mes` que se guardan junto a las columnas nuevas, para que
 * la app antigua (solo mensuales) siga haciendo lo mismo que la nueva. A los
 * no mensuales se les pone un `desde` que nunca llega.
 */
export function camposAntiguos(f: Pick<FijoNormal, 'frecuencia' | 'dia' | 'inicio' | 'ultimo_apunte'>): { desde: Mes; ultimo_mes: Mes | null } {
  if (f.frecuencia !== 'mensual') return { desde: DESDE_NUNCA, ultimo_mes: null }
  return { desde: mesInicial(f.dia, f.inicio), ultimo_mes: f.ultimo_apunte ? mesDe(f.ultimo_apunte) : null }
}

// --- Equivalencias -----------------------------------------------------------

/** Veces al año de cada frecuencia (365 días, 365/7 semanas, 12 meses). */
const VECES_AL_ANIO: Record<Frecuencia, number> = { diaria: 365, semanal: 365 / 7, mensual: 12, anual: 1 }

export interface Equivalencias {
  dia: number
  semana: number
  mes: number
  anio: number
}

/** Lo que cuesta un importe fijo al día, a la semana, al mes y al año (céntimos, redondeado). */
export function equivalencias(importe: number, frecuencia: Frecuencia): Equivalencias {
  const anual = importe * VECES_AL_ANIO[frecuencia]
  return {
    dia: Math.round(anual / 365),
    semana: Math.round((anual * 7) / 365),
    mes: Math.round(anual / 12),
    anio: Math.round(anual),
  }
}

/** Equivalente al mes de un fijo (céntimos). */
export function alMes(importe: number, frecuencia: string | null | undefined): number {
  return equivalencias(importe, esFrecuencia(frecuencia) ? frecuencia : 'mensual').mes
}

interface FijoConImporte {
  tipo: string
  importe_centimos: number
  frecuencia?: string | null
  activo: boolean
}

/** Total al mes de los gastos fijos activos (céntimos). */
export function totalFijoMensual(fijos: readonly FijoConImporte[], tipo: 'gasto' | 'ingreso' = 'gasto'): number {
  return fijos.filter((f) => f.activo && f.tipo === tipo).reduce((s, f) => s + alMes(f.importe_centimos, f.frecuencia), 0)
}

// --- Validación ----------------------------------------------------------------

export function validarDia(texto: string | number): number {
  const dia = typeof texto === 'number' ? texto : Number(String(texto).trim())
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) throw new ErrorDeValidacion('El día tiene que ser un número del 1 al 31.')
  return dia
}

export function validarFrecuencia(valor: string | null | undefined): Frecuencia {
  if (!esFrecuencia(valor)) throw new ErrorDeValidacion('Elige cada cuánto se repite.')
  return valor
}

const DIAS_POR_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/**
 * Día (y mes en los anuales) según la frecuencia:
 *  · mensual: día 1-31 · semanal: día de la semana 1-7 · diaria: 7 (no se usa)
 *  · anual: mes 1-12 y un día que exista en ese mes (29/2 vale).
 */
export function validarCuando(frecuencia: Frecuencia, dia: string | number, mes?: string | number | null): { dia: number; mes: number | null } {
  if (frecuencia === 'diaria') return { dia: 7, mes: null }
  if (frecuencia === 'semanal') {
    const d = Number(String(dia).trim())
    if (!Number.isInteger(d) || d < 1 || d > 7) throw new ErrorDeValidacion('Elige el día de la semana.')
    return { dia: d, mes: null }
  }
  const d = validarDia(dia)
  if (frecuencia === 'mensual') return { dia: d, mes: null }
  const m = Number(String(mes ?? '').trim())
  if (!Number.isInteger(m) || m < 1 || m > 12) throw new ErrorDeValidacion('Elige el mes.')
  if (d > DIAS_POR_MES[m - 1]) throw new ErrorDeValidacion('Ese mes no tiene tantos días.')
  return { dia: d, mes: m }
}

/** Importe máximo de un fijo diario: el apunte de la semana (×7) tiene que caber. */
export const IMPORTE_MAX_DIARIO = Math.floor(IMPORTE_MAX_CENTIMOS / 7)

/** Texto de cuándo se apunta: "Día 5 de cada mes", "Cada martes", "5 de marzo, cada año", "Cada día (se apunta el domingo)". */
export function textoCuando(fijo: FijoBasico): string {
  const f = normalizarFijo(fijo)
  switch (f.frecuencia) {
    case 'diaria':
      return 'Cada día · se apunta el domingo'
    case 'semanal':
      return `Cada ${DIAS_SEMANA[Math.min(Math.max(f.dia, 1), 7) - 1]}`
    case 'mensual':
      return `Día ${f.dia} de cada mes`
    case 'anual': {
      const nombreMes = new Intl.DateTimeFormat('es-ES', { month: 'long', timeZone: 'UTC' }).format(Date.UTC(2000, (f.mes ?? 1) - 1, 1))
      return `${f.dia} de ${nombreMes}, cada año`
    }
  }
}

// --- Origen de un movimiento ------------------------------------------------------

interface MovimientoConOrigen {
  id: string
  fecha: FechaDia
  fijo_id?: string | null
}

/**
 * ¿Lo apuntó un fijo? Los nuevos llevan `fijo_id`; los de antes de la
 * frecuencia se reconocen por su id (el del mes de algún fijo que aún existe).
 */
export function esDeFijo(m: MovimientoConOrigen, fijos: readonly { id: string }[]): boolean {
  if (m.fijo_id) return true
  const mes = mesDe(m.fecha)
  // Un id que no es UUID (fila dañada) no puede haber apuntado nada: se salta
  return fijos.some((f) => esUuid(f.id) && idApunteFijo(f.id, mes) === m.id)
}

/** Ids de los movimientos de una lista que apuntó algún fijo (para marcarlos con «Fijo»). */
export function idsDeFijos(movimientos: readonly MovimientoConOrigen[], fijos: readonly { id: string }[]): Set<string> {
  return new Set(movimientos.filter((m) => esDeFijo(m, fijos)).map((m) => m.id))
}
