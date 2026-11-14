// Lista de deseos conectada al ahorro. Lógica pura.
//
// El ahorro total de Dinero se reparte entre los artículos pendientes en
// orden de prioridad (alta, media, baja; dentro de cada una, el más antiguo
// primero): el primero se «lleva» el ahorro hasta su precio, el siguiente lo
// que sobre, y así. De ahí sale «te llega» o «te faltan X €» y la barra.

import { parsearImporte } from './dinero'
import { ErrorDeValidacion } from './validacion'

export { ErrorDeValidacion }

export const PRIORIDADES = ['alta', 'media', 'baja'] as const
export type Prioridad = (typeof PRIORIDADES)[number]
export const NOMBRE_PRIORIDAD: Record<Prioridad, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' }

export const ARTICULO_MAX = 120
export const ENLACE_MAX = 2000
export const NOTAS_DESEO_MAX = 1000

export const esPrioridad = (v: unknown): v is Prioridad => typeof v === 'string' && (PRIORIDADES as readonly string[]).includes(v)

export interface DeseoBasico {
  id: string
  articulo: string
  precio_centimos: number
  prioridad: string
  comprado: boolean
  created_at: string
}

export interface DatosDeseoTexto {
  articulo: string
  /** Como lo escribe el usuario ("59,99"). */
  precio: string
  prioridad: string
  /** '' = sin enlace. */
  enlace: string
  notas: string
}

/** Enlace seguro para abrir: solo http(s) y bien formado. null si no vale. */
export function enlaceSeguro(valor: string | null | undefined): string | null {
  if (!valor) return null
  const limpio = valor.trim()
  if (!/^https?:\/\//i.test(limpio) || /\s/.test(limpio) || limpio.length > ENLACE_MAX) return null
  try {
    const url = new URL(limpio)
    return url.protocol === 'https:' || url.protocol === 'http:' ? limpio : null
  } catch {
    return null
  }
}

export function validarDeseo(datos: DatosDeseoTexto) {
  const articulo = datos.articulo.trim().replace(/\s+/g, ' ')
  if (!articulo) throw new ErrorDeValidacion('Escribe qué quieres comprar.')
  if (articulo.length > ARTICULO_MAX) throw new ErrorDeValidacion(`El artículo no puede tener más de ${ARTICULO_MAX} caracteres.`)
  const precio_centimos = parsearImporte(datos.precio)
  if (!esPrioridad(datos.prioridad)) throw new ErrorDeValidacion('Elige la prioridad.')
  let enlace: string | null = null
  if (datos.enlace.trim()) {
    // Se acepta sin «https://» delante (lo normal al pegar «amazon.es/…»)
    // («//tienda.es/…» también: se le pone «https:» delante, no «https://»)
    const texto = datos.enlace.trim()
    const conProtocolo = /^[a-z][a-z0-9+.-]*:/i.test(texto) ? texto : texto.startsWith('//') ? `https:${texto}` : `https://${texto}`
    enlace = enlaceSeguro(conProtocolo)
    if (!enlace) throw new ErrorDeValidacion('El enlace no es válido: tiene que ser una dirección web (https://…).')
  }
  const notas = datos.notas.trim()
  if (notas.length > NOTAS_DESEO_MAX) throw new ErrorDeValidacion(`Las notas no pueden tener más de ${NOTAS_DESEO_MAX} caracteres.`)
  return { articulo, precio_centimos, prioridad: datos.prioridad, enlace, notas }
}

const ORDEN_PRIORIDAD: Record<string, number> = { alta: 0, media: 1, baja: 2 }

/** Pendientes por prioridad (y el más antiguo primero dentro de cada una). */
export function ordenarDeseos<D extends DeseoBasico>(deseos: readonly D[]): D[] {
  return deseos
    .filter((d) => !d.comprado)
    .sort((a, b) => (ORDEN_PRIORIDAD[a.prioridad] ?? 3) - (ORDEN_PRIORIDAD[b.prioridad] ?? 3) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
}

export interface DeseoConAhorro<D extends DeseoBasico = DeseoBasico> {
  deseo: D
  /** Parte del ahorro que le toca (0…precio). */
  cubierto: number
  /** Lo que falta (0 = te llega). */
  falta: number
  teLlega: boolean
  /** 0-100, entero. */
  porcentaje: number
}

/** Reparte el ahorro total entre los pendientes, en orden de prioridad. */
export function repartirAhorro<D extends DeseoBasico>(deseos: readonly D[], ahorroTotal: number): DeseoConAhorro<D>[] {
  let disponible = Math.max(0, ahorroTotal)
  return ordenarDeseos(deseos).map((deseo) => {
    const cubierto = Math.min(deseo.precio_centimos, disponible)
    disponible -= cubierto
    const falta = deseo.precio_centimos - cubierto
    return { deseo, cubierto, falta, teLlega: falta === 0, porcentaje: Math.floor((cubierto * 100) / deseo.precio_centimos) }
  })
}

/** Comprados, el más reciente primero. */
export function historial<D extends DeseoBasico & { comprado_en: string | null }>(deseos: readonly D[]): D[] {
  return deseos.filter((d) => d.comprado).sort((a, b) => (b.comprado_en ?? '').localeCompare(a.comprado_en ?? '') || b.created_at.localeCompare(a.created_at))
}
