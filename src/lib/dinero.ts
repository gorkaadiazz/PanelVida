// Lógica pura del dinero: importes en CÉNTIMOS (enteros, nunca decimales),
// resúmenes por mes, la gráfica de 6 meses y la meta de ahorro.
// Sin React ni Supabase.

import { esFechaDia, type FechaDia } from './fechas'
import { ErrorDeValidacion } from './validacion'

export { ErrorDeValidacion }

export type TipoMovimiento = 'ingreso' | 'gasto'

/** Mes en formato AAAA-MM. */
export type Mes = string

export const CONCEPTO_MAX = 120
/** Tope del servidor: menos de mil millones de euros. */
export const IMPORTE_MAX_CENTIMOS = 100_000_000_000 - 1
export const MESES_GRAFICA = 6

export interface MovimientoBasico {
  tipo: string
  importe_centimos: number
  fecha: FechaDia
}

export interface ResumenMes {
  ingresos: number
  gastos: number
  /** ingresos − gastos (puede ser negativo). */
  ahorro: number
}

export interface BarraMes extends ResumenMes {
  mes: Mes
  /** "nov", "dic"… */
  etiqueta: string
  /** "noviembre de 2026" */
  nombre: string
}

const formatoEuros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })
const formatoMesCorto = new Intl.DateTimeFormat('es-ES', { month: 'short', timeZone: 'UTC' })
const formatoMesLargo = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** 1250 → "12,50 €". Negativos con el signo menos tipográfico: "−3,00 €" (igual que en la lista). */
export function formatearEuros(centimos: number): string {
  return formatoEuros.format(centimos / 100).replace(/^-/, '−')
}

/** 1250 → "12,50" (para rellenar un campo de importe). */
export function centimosATexto(centimos: number): string {
  const signo = centimos < 0 ? '-' : ''
  const abs = Math.abs(Math.trunc(centimos))
  return `${signo}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}

/**
 * Lee un importe escrito por el usuario y lo devuelve en céntimos, SIN pasar
 * por números con decimales (0,1 + 0,2 no da 0,3). Acepta "12", "12,5",
 * "12,50", "12.50", "1.234,56", "1 234,56" y "12 €". Lanza ErrorDeValidacion
 * si no es un importe positivo con 2 decimales como mucho.
 */
export function parsearImporte(texto: string): number {
  let limpio = texto.trim().replace(/\s|€/g, '')
  if (!limpio) throw new ErrorDeValidacion('Escribe el importe.')
  // "1.234,56": el punto es de miles y la coma, decimal
  if (limpio.includes(',')) limpio = limpio.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(limpio)) limpio = limpio.replace(/\./g, '') // "1.234" = mil doscientos…
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(limpio)
  if (!m) throw new ErrorDeValidacion('El importe no es válido. Escríbelo así: 12,50')
  const centimos = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
  // Un número enorme deja de ser un entero seguro (o es Infinity): es «demasiado grande», no «0»
  if (!Number.isSafeInteger(centimos) || centimos > IMPORTE_MAX_CENTIMOS) throw new ErrorDeValidacion('El importe es demasiado grande.')
  if (centimos <= 0) throw new ErrorDeValidacion('El importe tiene que ser mayor que 0.')
  return centimos
}

export function validarConcepto(concepto: string): string {
  const limpio = concepto.trim().replace(/\s+/g, ' ')
  if (!limpio) throw new ErrorDeValidacion('Escribe un concepto.')
  if (limpio.length > CONCEPTO_MAX) throw new ErrorDeValidacion(`El concepto no puede tener más de ${CONCEPTO_MAX} caracteres.`)
  return limpio
}

export function validarTipo(tipo: string): TipoMovimiento {
  if (tipo !== 'ingreso' && tipo !== 'gasto') throw new ErrorDeValidacion('Elige si es ingreso o gasto.')
  return tipo
}

export function validarFechaMovimiento(fecha: string): FechaDia {
  if (!esFechaDia(fecha)) throw new ErrorDeValidacion('La fecha no es válida.')
  return fecha
}

/** Mes de una fecha de día: "2026-11-13" → "2026-11". */
export function mesDe(fecha: FechaDia): Mes {
  return fecha.slice(0, 7)
}

/** Suma (o resta) meses a un mes AAAA-MM. */
export function sumarMeses(mes: Mes, n: number): Mes {
  const [a, m] = mes.split('-').map(Number)
  const total = a * 12 + (m - 1) + Math.trunc(n)
  return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}`
}

/** "noviembre de 2026" */
export function nombreMes(mes: Mes): string {
  return formatoMesLargo.format(Date.parse(`${mes}-01T00:00:00Z`))
}

function etiquetaMes(mes: Mes): string {
  return formatoMesCorto.format(Date.parse(`${mes}-01T00:00:00Z`)).replace('.', '')
}

/** Ingresos, gastos y ahorro de unos movimientos (todos los que se pasen). */
export function resumir(movimientos: readonly MovimientoBasico[]): ResumenMes {
  let ingresos = 0
  let gastos = 0
  for (const m of movimientos) {
    if (m.tipo === 'ingreso') ingresos += m.importe_centimos
    else if (m.tipo === 'gasto') gastos += m.importe_centimos
  }
  return { ingresos, gastos, ahorro: ingresos - gastos }
}

/** Resumen de un mes (AAAA-MM). */
export function resumenMes(movimientos: readonly MovimientoBasico[], mes: Mes): ResumenMes {
  return resumir(movimientos.filter((m) => mesDe(m.fecha) === mes))
}

/** Una barra por mes, de `MESES_GRAFICA` meses atrás hasta `mesActual` (incluido). */
export function ultimosMeses(movimientos: readonly MovimientoBasico[], mesActual: Mes, n: number = MESES_GRAFICA): BarraMes[] {
  const porMes = new Map<Mes, MovimientoBasico[]>()
  for (const m of movimientos) {
    const mes = mesDe(m.fecha)
    let lista = porMes.get(mes)
    if (!lista) porMes.set(mes, (lista = []))
    lista.push(m)
  }
  return Array.from({ length: Math.max(0, n) }, (_, i) => {
    const mes = sumarMeses(mesActual, i - (n - 1))
    return { mes, etiqueta: etiquetaMes(mes), nombre: nombreMes(mes), ...resumir(porMes.get(mes) ?? []) }
  })
}

/** Movimientos de un mes, del más reciente al más antiguo. */
export function movimientosDelMes<M extends MovimientoBasico & { created_at: string; id: string }>(movimientos: readonly M[], mes: Mes): M[] {
  return movimientos
    .filter((m) => mesDe(m.fecha) === mes)
    .sort((a, b) => (a.fecha === b.fecha ? b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id) : a.fecha < b.fecha ? 1 : -1))
}

export interface ProgresoMeta {
  /** 0-100 (entero). 0 si el ahorro es negativo. */
  porcentaje: number
  conseguida: boolean
  /** Lo que falta (0 si ya se ha llegado). */
  faltan: number
}

/** Progreso del ahorro total hacia la meta (null si no hay meta). */
export function progresoMeta(ahorroTotal: number, meta: number | null | undefined): ProgresoMeta | null {
  if (!meta || meta <= 0) return null
  // Primero ×100 y después ÷: (2900 / 10000) * 100 da 28,999… en coma flotante y saldría 28 %
  const porcentaje = Math.max(0, Math.min(100, Math.floor((ahorroTotal * 100) / meta)))
  return { porcentaje, conseguida: ahorroTotal >= meta, faltan: Math.max(0, meta - ahorroTotal) }
}

/** Meta escrita por el usuario: '' = sin meta (null). */
export function parsearMeta(texto: string): number | null {
  if (!texto.trim()) return null
  return parsearImporte(texto)
}

/**
 * Precio de un cliente: como un importe, pero aquí 0 sí vale (una web
 * regalada o aún sin precio). '' también es 0.
 */
export function parsearPrecio(texto: string): number {
  if (/^\s*0*(?:[.,]0{0,2})?\s*€?\s*$/.test(texto)) return 0
  return parsearImporte(texto)
}

// ---------------------------------------------------------------------------
// Categorías de gastos
// ---------------------------------------------------------------------------

/**
 * Categorías de gasto (lista cerrada: la misma que el `check` de la base de
 * datos en 20261114000100_categorias_y_fijos.sql). Los ingresos no llevan.
 */
export const CATEGORIAS = ['comida', 'transporte', 'ocio', 'compras', 'casa', 'suscripciones', 'estudios', 'salud', 'otros'] as const
export type Categoria = (typeof CATEGORIAS)[number]

export const NOMBRE_CATEGORIA: Record<Categoria, string> = {
  comida: 'Comida',
  transporte: 'Transporte',
  ocio: 'Ocio',
  compras: 'Compras',
  casa: 'Casa',
  suscripciones: 'Suscripciones',
  estudios: 'Estudios',
  salud: 'Salud',
  otros: 'Otros',
}

export function esCategoria(valor: unknown): valor is Categoria {
  return typeof valor === 'string' && (CATEGORIAS as readonly string[]).includes(valor)
}

/**
 * Categoría que se guarda: null en los ingresos (aunque llegue una) y si se
 * deja vacía. Lanza ErrorDeValidacion si no es de la lista.
 */
export function validarCategoria(tipo: TipoMovimiento, categoria: string | null | undefined): Categoria | null {
  if (tipo === 'ingreso' || !categoria) return null
  if (!esCategoria(categoria)) throw new ErrorDeValidacion('Elige una categoría de la lista.')
  return categoria
}

export interface GastoCategoria {
  /** null = gastos sin categoría. */
  categoria: Categoria | null
  nombre: string
  total: number
  /** 0-100 sobre el total de gastos (redondeado; puede no sumar 100 justo). */
  porcentaje: number
}

/** Gastos de un mes agrupados por categoría, de la que más a la que menos. */
export function gastosPorCategoria(movimientos: readonly (MovimientoBasico & { categoria?: string | null })[], mes: Mes): GastoCategoria[] {
  const totales = new Map<Categoria | null, number>()
  let suma = 0
  for (const m of movimientos) {
    if (m.tipo !== 'gasto' || mesDe(m.fecha) !== mes) continue
    // Una categoría desconocida (de una versión más nueva) cuenta como «sin categoría»
    const c = esCategoria(m.categoria) ? m.categoria : null
    totales.set(c, (totales.get(c) ?? 0) + m.importe_centimos)
    suma += m.importe_centimos
  }
  return [...totales]
    .map(([categoria, total]) => ({
      categoria,
      nombre: categoria ? NOMBRE_CATEGORIA[categoria] : 'Sin categoría',
      total,
      porcentaje: suma ? Math.round((total * 100) / suma) : 0,
    }))
    // De más a menos; «Sin categoría» al final si empata
    .sort((a, b) => b.total - a.total || (a.categoria === null ? 1 : b.categoria === null ? -1 : a.nombre.localeCompare(b.nombre, 'es')))
}

// ---------------------------------------------------------------------------
// Esencial o prescindible (solo gastos; opcional)
// ---------------------------------------------------------------------------

export const NECESIDADES = ['esencial', 'prescindible'] as const
export type Necesidad = (typeof NECESIDADES)[number]

export const NOMBRE_NECESIDAD: Record<Necesidad, string> = { esencial: 'Esencial', prescindible: 'Prescindible' }

export function esNecesidad(valor: unknown): valor is Necesidad {
  return typeof valor === 'string' && (NECESIDADES as readonly string[]).includes(valor)
}

/** null en los ingresos y si se deja vacía. Lanza ErrorDeValidacion si no es de la lista. */
export function validarNecesidad(tipo: TipoMovimiento, necesidad: string | null | undefined): Necesidad | null {
  if (tipo === 'ingreso' || !necesidad) return null
  if (!esNecesidad(necesidad)) throw new ErrorDeValidacion('Elige «esencial» o «prescindible».')
  return necesidad
}

// ---------------------------------------------------------------------------
// Efectivo o tarjeta (gastos e ingresos)
// ---------------------------------------------------------------------------

export const MEDIOS = ['tarjeta', 'efectivo'] as const
export type Medio = (typeof MEDIOS)[number]

export const NOMBRE_MEDIO: Record<Medio, string> = { tarjeta: 'Tarjeta', efectivo: 'Efectivo' }

/** Lo que se usa si no se dice nada (igual que el `default` de la base de datos). */
export const MEDIO_POR_DEFECTO: Medio = 'tarjeta'

export function esMedio(valor: unknown): valor is Medio {
  return typeof valor === 'string' && (MEDIOS as readonly string[]).includes(valor)
}

/**
 * Medio de una fila guardada. Una fila sin él (creada antes de existir, o
 * aún sin descargar) o con uno desconocido cuenta como tarjeta, que es lo
 * que guarda el servidor por defecto.
 */
export function medioDe(fila: { medio?: string | null }): Medio {
  return esMedio(fila.medio) ? fila.medio : MEDIO_POR_DEFECTO
}

/** '' o sin poner = tarjeta. Lanza ErrorDeValidacion si no es de la lista. */
export function validarMedio(medio: string | null | undefined): Medio {
  if (!medio) return MEDIO_POR_DEFECTO
  if (!esMedio(medio)) throw new ErrorDeValidacion('Elige «tarjeta» o «efectivo».')
  return medio
}

/** Ingresos, gastos y ahorro de un mes separados en tarjeta y efectivo. */
export function resumenMesPorMedio(movimientos: readonly (MovimientoBasico & { medio?: string | null })[], mes: Mes): Record<Medio, ResumenMes> {
  const delMes = movimientos.filter((m) => mesDe(m.fecha) === mes)
  return {
    tarjeta: resumir(delMes.filter((m) => medioDe(m) === 'tarjeta')),
    efectivo: resumir(delMes.filter((m) => medioDe(m) === 'efectivo')),
  }
}
