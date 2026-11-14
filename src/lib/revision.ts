// Revisión semanal y mensual del dinero (sin IA: reglas y cuentas aquí).
//
// Al día siguiente de terminar la semana (lunes a domingo) o el mes, la app
// calcula una revisión y la guarda (tabla `revisiones`): gasto por categoría
// frente al periodo anterior, fijos, prescindibles, lo que falta para la meta
// y para la lista de deseos, y sugerencias de recorte con su impacto.
// La revisión es una FOTO: no cambia aunque luego se apunte algo de ese periodo.
//
// Las sugerencias solo sugieren (las decisiones son del usuario) y salen de
// cuatro reglas:
//  1. prescindible:   gastos marcados como prescindibles en el periodo, de mayor a menor.
//  2. fijo_caro:      fijos no esenciales, los más caros en su equivalente al mes.
//  3. categoria_sube: categorías muy por encima de su media de las semanas o meses anteriores.
//  4. solapados:      dos o más fijos de suscripciones (u ocio) a la vez.
// Cada una dice cuánto ahorras al mes y qué cambia en la meta de ahorro.

import { esCategoria, formatearEuros, mesDe, NOMBRE_CATEGORIA, resumir, sumarMeses, type Categoria } from './dinero'
import { repartirAhorro, type DeseoBasico } from './deseos'
import { esFechaDia, sumarDias, type FechaDia } from './fechas'
import { alMes, esDeFijo, fechaEnMes, totalFijoMensual } from './fijos'
import { cuandoLlego, DIAS_POR_MES, impactoEnMeta, ritmoAhorro, textoImpacto, VENTANA_POR_DEFECTO, type Impacto } from './prevision'
import { lunesDe } from './semana'
import { uuidV5 } from './uuid'

export const TIPOS_REVISION = ['semanal', 'mensual'] as const
export type TipoRevision = (typeof TIPOS_REVISION)[number]

export interface Periodo {
  tipo: TipoRevision
  inicio: FechaDia
  fin: FechaDia
}

/** Periodos anteriores con los que se calcula la media de cada categoría. */
export const PERIODOS_MEDIA: Record<TipoRevision, number> = { semanal: 4, mensual: 3 }
/** Una categoría «sube mucho» si pasa de su media en este porcentaje… */
export const SUBIDA_MINIMA = 0.25
/** …y en al menos este importe (céntimos). */
export const SUBIDA_MINIMA_CENTIMOS: Record<TipoRevision, number> = { semanal: 500, mensual: 2000 }
/** Sugerencias de cada regla como mucho. */
export const MAX_POR_REGLA = 3
/** Categorías en las que dos fijos a la vez se consideran solapados. */
export const CATEGORIAS_SOLAPABLES: readonly Categoria[] = ['suscripciones', 'ocio']
/** Deseos pendientes que se enseñan en la revisión. */
export const MAX_DESEOS = 5

// --- Periodos -----------------------------------------------------------------

/** El último periodo ya terminado antes de hoy (la semana pasada o el mes pasado). */
export function periodoTerminado(tipo: TipoRevision, hoy: FechaDia): Periodo {
  if (tipo === 'semanal') {
    const inicio = sumarDias(lunesDe(hoy), -7)
    return { tipo, inicio, fin: sumarDias(inicio, 6) }
  }
  const mes = sumarMeses(mesDe(hoy), -1)
  return { tipo, inicio: `${mes}-01`, fin: fechaEnMes(mes, 31) }
}

/** El periodo de antes (`n` periodos atrás). */
export function periodoAnterior(p: Periodo, n: number = 1): Periodo {
  if (p.tipo === 'semanal') {
    const inicio = sumarDias(p.inicio, -7 * n)
    return { tipo: p.tipo, inicio, fin: sumarDias(inicio, 6) }
  }
  const mes = sumarMeses(mesDe(p.inicio), -n)
  return { tipo: p.tipo, inicio: `${mes}-01`, fin: fechaEnMes(mes, 31) }
}

const enPeriodo = (fecha: FechaDia, p: Periodo) => fecha >= p.inicio && fecha <= p.fin

/**
 * Id de una revisión: UUID v5 con el id del usuario como espacio. El mismo en
 * todos sus dispositivos (no se duplica). No cambiar la fórmula.
 */
export function idRevision(usuarioId: string, tipo: TipoRevision, inicio: FechaDia): string {
  return uuidV5(`revision:${tipo}:${inicio}`, usuarioId.toLowerCase())
}

/** Pasa un importe del periodo a «al mes» (una semana son 30,4 / 7 semanas). */
function factorAlMes(tipo: TipoRevision): number {
  return tipo === 'semanal' ? DIAS_POR_MES / 7 : 1
}

// --- Datos de entrada -----------------------------------------------------------

export interface MovimientoRevision {
  id: string
  tipo: string
  concepto: string
  importe_centimos: number
  fecha: FechaDia
  categoria?: string | null
  necesidad?: string | null
  fijo_id?: string | null
}

export interface FijoRevision {
  id: string
  tipo: string
  concepto: string
  importe_centimos: number
  frecuencia?: string | null
  categoria: string | null
  necesidad?: string | null
  activo: boolean
}

export interface EntradaRevision {
  periodo: Periodo
  movimientos: readonly MovimientoRevision[]
  fijos: readonly FijoRevision[]
  deseos: readonly DeseoBasico[]
  meta: number | null
  hoy: FechaDia
}

// --- Resultado (lo que se guarda en `revisiones.datos`) ---------------------------

export type ReglaSugerencia = 'prescindible' | 'fijo_caro' | 'categoria_sube' | 'solapados'

export interface Sugerencia {
  regla: ReglaSugerencia
  /** Concepto del gasto o del fijo, o nombre de la categoría. */
  titulo: string
  /** Lo gastado en el periodo (prescindible, categoria_sube) o el fijo al mes. */
  importe: number
  /** Media de la categoría (solo categoria_sube). */
  media?: number
  /** Los fijos que se solapan (solo solapados); `titulo` es el más barato. */
  conceptos?: string[]
  ahorro_mes: number
  ahorro_anio: number
  impacto: Impacto
}

export interface CategoriaRevision {
  /** null = sin categoría. */
  categoria: Categoria | null
  actual: number
  anterior: number
  /** Media de los periodos anteriores con datos (null si no hay). */
  media: number | null
}

export interface DatosRevision {
  v: 1
  ingresos: number
  gastos: number
  ingresos_anterior: number
  gastos_anterior: number
  categorias: CategoriaRevision[]
  /** Gastos fijos activos, al mes. */
  fijos_mes: number
  /** Lo que se fue en apuntes de fijos durante el periodo. */
  fijos_periodo: number
  /** Gastos marcados como prescindibles en el periodo. */
  prescindibles: number
  ahorro_total: number
  meta: number | null
  /** Ritmo de ahorro al mes cuando se hizo la revisión. */
  ritmo: number
  /** Fecha en que llegarías a la meta a ese ritmo (null si no hay meta, ya llegaste o no llegas). */
  llegada_meta: FechaDia | null
  deseos: { articulo: string; falta: number }[]
  sugerencias: Sugerencia[]
}

// --- Cálculo ----------------------------------------------------------------------

/** ¿Hay algo apuntado en el periodo? (si no, no se hace revisión). */
export function hayMovimientos(movimientos: readonly { fecha: FechaDia }[], p: Periodo): boolean {
  return movimientos.some((m) => enPeriodo(m.fecha, p))
}

function gastosPorCategoria(movimientos: readonly MovimientoRevision[], p: Periodo): Map<Categoria | null, number> {
  const totales = new Map<Categoria | null, number>()
  for (const m of movimientos) {
    if (m.tipo !== 'gasto' || !enPeriodo(m.fecha, p)) continue
    const c = esCategoria(m.categoria) ? m.categoria : null
    totales.set(c, (totales.get(c) ?? 0) + m.importe_centimos)
  }
  return totales
}

const normalizar = (texto: string) => texto.trim().toLocaleLowerCase('es-ES')

export function calcularRevision(e: EntradaRevision): DatosRevision {
  const { periodo: p, movimientos, fijos, hoy } = e
  const anterior = periodoAnterior(p)
  const delPeriodo = movimientos.filter((m) => enPeriodo(m.fecha, p))
  const resumen = resumir(delPeriodo)
  const resumenAnterior = resumir(movimientos.filter((m) => enPeriodo(m.fecha, anterior)))
  const factor = factorAlMes(p.tipo)

  // Ahorro y ritmo (lo de hoy: la revisión se calcula al día siguiente)
  const ahorroTotal = resumir(movimientos).ahorro
  const ritmo = ritmoAhorro(movimientos, fijos, VENTANA_POR_DEFECTO, hoy).mensual
  const impacto = (extra: number) => impactoEnMeta(ahorroTotal, e.meta, ritmo, extra, hoy)
  const sugerencia = (s: Omit<Sugerencia, 'ahorro_anio' | 'impacto'>): Sugerencia => ({
    ...s,
    ahorro_anio: s.ahorro_mes * 12,
    impacto: impacto(s.ahorro_mes),
  })

  // Categorías: este periodo, el anterior y la media de los anteriores con datos
  const primerDia = movimientos.reduce<FechaDia | null>((min, m) => (min === null || m.fecha < min ? m.fecha : min), null)
  const previos = Array.from({ length: PERIODOS_MEDIA[p.tipo] }, (_, i) => periodoAnterior(p, i + 1)).filter(
    (q) => primerDia !== null && primerDia <= q.inicio,
  )
  const actual = gastosPorCategoria(movimientos, p)
  const delAnterior = gastosPorCategoria(movimientos, anterior)
  const porPrevio = previos.map((q) => gastosPorCategoria(movimientos, q))
  const claves = new Set<Categoria | null>([...actual.keys(), ...delAnterior.keys()])
  const categorias: CategoriaRevision[] = [...claves]
    .map((categoria) => ({
      categoria,
      actual: actual.get(categoria) ?? 0,
      anterior: delAnterior.get(categoria) ?? 0,
      media: porPrevio.length ? Math.round(porPrevio.reduce((s, t) => s + (t.get(categoria) ?? 0), 0) / porPrevio.length) : null,
    }))
    .sort((a, b) => b.actual - a.actual || b.anterior - a.anterior)

  const sugerencias: Sugerencia[] = []

  // 1. Gastos prescindibles del periodo (a mano; los fijos van en la regla 2)
  const prescindibles = new Map<string, { titulo: string; total: number }>()
  for (const m of delPeriodo) {
    if (m.tipo !== 'gasto' || m.necesidad !== 'prescindible' || esDeFijo(m, fijos)) continue
    const clave = normalizar(m.concepto)
    const g = prescindibles.get(clave) ?? { titulo: m.concepto.trim(), total: 0 }
    g.total += m.importe_centimos
    prescindibles.set(clave, g)
  }
  for (const g of [...prescindibles.values()].sort((a, b) => b.total - a.total).slice(0, MAX_POR_REGLA)) {
    sugerencias.push(sugerencia({ regla: 'prescindible', titulo: g.titulo, importe: g.total, ahorro_mes: Math.round(g.total * factor) }))
  }

  // 2. Fijos más caros (los no marcados como esenciales)
  const recortables = fijos.filter((f) => f.activo && f.tipo === 'gasto' && f.necesidad !== 'esencial')
  const caros = recortables
    .map((f) => ({ f, mes: alMes(f.importe_centimos, f.frecuencia) }))
    .filter((x) => x.mes > 0)
    .sort((a, b) => b.mes - a.mes || a.f.concepto.localeCompare(b.f.concepto, 'es'))
  for (const { f, mes } of caros.slice(0, MAX_POR_REGLA)) {
    sugerencias.push(sugerencia({ regla: 'fijo_caro', titulo: f.concepto, importe: mes, ahorro_mes: mes }))
  }

  // 3. Categorías que han subido mucho respecto a su media
  for (const c of categorias) {
    if (c.media === null || c.media === 0) continue
    const subida = c.actual - c.media
    if (c.actual < c.media * (1 + SUBIDA_MINIMA) || subida < SUBIDA_MINIMA_CENTIMOS[p.tipo]) continue
    sugerencias.push(
      sugerencia({
        regla: 'categoria_sube',
        titulo: c.categoria ? NOMBRE_CATEGORIA[c.categoria] : 'Sin categoría',
        importe: c.actual,
        media: c.media,
        ahorro_mes: Math.round(subida * factor),
      }),
    )
  }
  // (si hay muchas, las que más suben)
  const subidas = sugerencias.filter((s) => s.regla === 'categoria_sube').sort((a, b) => b.ahorro_mes - a.ahorro_mes)
  for (const s of subidas.slice(MAX_POR_REGLA)) sugerencias.splice(sugerencias.indexOf(s), 1)

  // 4. Fijos que se solapan: dos o más de la misma categoría de suscripciones u ocio
  for (const categoria of CATEGORIAS_SOLAPABLES) {
    const grupo = recortables
      .filter((f) => f.categoria === categoria && f.frecuencia !== 'diaria')
      .map((f) => ({ f, mes: alMes(f.importe_centimos, f.frecuencia) }))
      .sort((a, b) => a.mes - b.mes || a.f.concepto.localeCompare(b.f.concepto, 'es'))
    if (grupo.length < 2) continue
    const masBarato = grupo[0]
    sugerencias.push(
      sugerencia({
        regla: 'solapados',
        titulo: masBarato.f.concepto,
        importe: masBarato.mes,
        conceptos: grupo.map((x) => x.f.concepto),
        ahorro_mes: masBarato.mes,
      }),
    )
  }

  const llegada = e.meta === null ? null : cuandoLlego(ahorroTotal, e.meta, ritmo, hoy)
  return {
    v: 1,
    ingresos: resumen.ingresos,
    gastos: resumen.gastos,
    ingresos_anterior: resumenAnterior.ingresos,
    gastos_anterior: resumenAnterior.gastos,
    categorias,
    fijos_mes: totalFijoMensual(fijos, 'gasto'),
    fijos_periodo: delPeriodo.filter((m) => m.tipo === 'gasto' && esDeFijo(m, fijos)).reduce((s, m) => s + m.importe_centimos, 0),
    prescindibles: delPeriodo.filter((m) => m.tipo === 'gasto' && m.necesidad === 'prescindible').reduce((s, m) => s + m.importe_centimos, 0),
    ahorro_total: ahorroTotal,
    meta: e.meta,
    ritmo,
    llegada_meta: llegada?.estado === 'llega' ? llegada.fecha : null,
    deseos: repartirAhorro(e.deseos, ahorroTotal)
      .filter((d) => d.falta > 0)
      .slice(0, MAX_DESEOS)
      .map((d) => ({ articulo: d.deseo.articulo, falta: d.falta })),
    sugerencias,
  }
}

/**
 * Lo que ahorrarías al mes con los recortes sugeridos (para el escenario «con
 * recortes» de la previsión). Los solapados no se suman: ese fijo ya está en
 * «fijos más caros» o es un recorte alternativo.
 */
export function ahorroDeRecortes(sugerencias: readonly Sugerencia[]): number {
  return sugerencias.filter((s) => s.regla !== 'solapados').reduce((total, s) => total + s.ahorro_mes, 0)
}

// --- Comparaciones y textos -------------------------------------------------------

export interface Cambio {
  /** actual − anterior (céntimos). */
  diferencia: number
  /** % respecto al anterior, redondeado (null si el anterior era 0). */
  porcentaje: number | null
}

export function cambio(actual: number, anterior: number): Cambio {
  return { diferencia: actual - anterior, porcentaje: anterior > 0 ? Math.round(((actual - anterior) * 100) / anterior) : null }
}

/** "+12,00 € (+25 %)", "−5,00 € (−10 %)", "igual", "+8,00 € (antes 0)". */
export function textoCambio(actual: number, anterior: number): string {
  const { diferencia, porcentaje } = cambio(actual, anterior)
  if (diferencia === 0) return 'igual'
  const signo = diferencia > 0 ? '+' : '−'
  const euros = `${signo}${formatearEuros(Math.abs(diferencia))}`
  if (porcentaje === null) return `${euros} (antes 0)`
  return `${euros} (${signo}${Math.abs(porcentaje)} %)`
}

/** "la semana del 9 al 15 de noviembre" / "octubre de 2026". */
export function nombrePeriodo(p: Periodo): string {
  const fmt = (opciones: Intl.DateTimeFormatOptions, fecha: FechaDia) =>
    new Intl.DateTimeFormat('es-ES', { ...opciones, timeZone: 'UTC' }).format(Date.parse(`${fecha}T00:00:00Z`))
  if (p.tipo === 'mensual') return fmt({ month: 'long', year: 'numeric' }, p.inicio)
  const mismoMes = mesDe(p.inicio) === mesDe(p.fin)
  return mismoMes
    ? `semana del ${Number(p.inicio.slice(8))} al ${fmt({ day: 'numeric', month: 'long' }, p.fin)}`
    : `semana del ${fmt({ day: 'numeric', month: 'long' }, p.inicio)} al ${fmt({ day: 'numeric', month: 'long' }, p.fin)}`
}

/** Frase de una sugerencia, directa y sin sermones. */
export function textoSugerencia(s: Sugerencia, tipo: TipoRevision): string {
  const eur = formatearEuros
  const enEse = tipo === 'semanal' ? 'esa semana' : 'ese mes'
  const alMesTxt = `${tipo === 'semanal' ? '~' : ''}${eur(s.ahorro_mes)}/mes`
  const efecto = textoImpacto(s.impacto)
  const fin = efecto ? ` y ${efecto}.` : '.'
  switch (s.regla) {
    case 'prescindible':
      return `Si dejas «${s.titulo}» (${eur(s.importe)} ${enEse}) ahorras ${alMesTxt}${fin}`
    case 'fijo_caro':
      return `Si quitas «${s.titulo}» ahorras ${eur(s.ahorro_mes)}/mes (${eur(s.ahorro_anio)}/año)${fin}`
    case 'categoria_sube':
      return `${s.titulo}: ${eur(s.importe)} ${enEse}, por encima de tu media (${eur(s.media ?? 0)}). Si vuelves a tu media ahorras ${alMesTxt}${fin}`
    case 'solapados': {
      const lista = s.conceptos ?? [s.titulo]
      const nombres = lista.length > 1 ? `${lista.slice(0, -1).map((c) => `«${c}»`).join(', ')} y «${lista.at(-1)}»` : `«${lista[0]}»`
      return `Tienes a la vez ${nombres}. Si quitas «${s.titulo}» ahorras ${eur(s.ahorro_mes)}/mes${fin}`
    }
  }
}

// --- Lectura segura de lo guardado --------------------------------------------------

const esEntero = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v)
const esTexto = (v: unknown, max = 200): v is string => typeof v === 'string' && v.length <= max
const REGLAS: readonly string[] = ['prescindible', 'fijo_caro', 'categoria_sube', 'solapados']

function leerImpacto(v: unknown): Impacto {
  if (!v || typeof v !== 'object') return null
  const i = v as Record<string, unknown>
  if (i.tipo === 'antes' && esEntero(i.dias) && i.dias > 0) return { tipo: 'antes', dias: i.dias }
  if (i.tipo === 'desbloquea' && esFechaDia(i.fecha)) return { tipo: 'desbloquea', fecha: i.fecha }
  return null
}

function leerSugerencia(v: unknown): Sugerencia | null {
  if (!v || typeof v !== 'object') return null
  const s = v as Record<string, unknown>
  if (!REGLAS.includes(s.regla as string) || !esTexto(s.titulo) || !esEntero(s.importe) || !esEntero(s.ahorro_mes) || !esEntero(s.ahorro_anio)) return null
  return {
    regla: s.regla as ReglaSugerencia,
    titulo: s.titulo,
    importe: s.importe,
    ahorro_mes: s.ahorro_mes,
    ahorro_anio: s.ahorro_anio,
    impacto: leerImpacto(s.impacto),
    ...(esEntero(s.media) ? { media: s.media } : {}),
    ...(Array.isArray(s.conceptos) ? { conceptos: s.conceptos.filter((c): c is string => esTexto(c)).slice(0, 20) } : {}),
  }
}

/**
 * Lee los datos de una revisión guardada; null si no tienen la forma
 * esperada (otra versión o datos dañados): la pantalla dice que no se puede ver.
 */
export function leerDatosRevision(v: unknown): DatosRevision | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const d = v as Record<string, unknown>
  const numeros = ['ingresos', 'gastos', 'ingresos_anterior', 'gastos_anterior', 'fijos_mes', 'fijos_periodo', 'prescindibles', 'ahorro_total', 'ritmo'] as const
  if (d.v !== 1 || !numeros.every((n) => esEntero(d[n]))) return null
  if (!Array.isArray(d.categorias) || !Array.isArray(d.deseos) || !Array.isArray(d.sugerencias)) return null
  const categorias: CategoriaRevision[] = d.categorias.flatMap((c: unknown) => {
    if (!c || typeof c !== 'object') return []
    const x = c as Record<string, unknown>
    if (!esEntero(x.actual) || !esEntero(x.anterior)) return []
    return [{ categoria: esCategoria(x.categoria) ? x.categoria : null, actual: x.actual, anterior: x.anterior, media: esEntero(x.media) ? x.media : null }]
  })
  const deseos = d.deseos.flatMap((x: unknown) => {
    const o = x as Record<string, unknown> | null
    return o && esTexto(o.articulo) && esEntero(o.falta) ? [{ articulo: o.articulo, falta: o.falta }] : []
  })
  return {
    v: 1,
    ingresos: d.ingresos as number,
    gastos: d.gastos as number,
    ingresos_anterior: d.ingresos_anterior as number,
    gastos_anterior: d.gastos_anterior as number,
    categorias,
    fijos_mes: d.fijos_mes as number,
    fijos_periodo: d.fijos_periodo as number,
    prescindibles: d.prescindibles as number,
    ahorro_total: d.ahorro_total as number,
    meta: esEntero(d.meta) ? d.meta : null,
    ritmo: d.ritmo as number,
    llegada_meta: esFechaDia(d.llegada_meta) ? d.llegada_meta : null,
    deseos,
    sugerencias: d.sugerencias.map(leerSugerencia).filter((s): s is Sugerencia => s !== null),
  }
}

