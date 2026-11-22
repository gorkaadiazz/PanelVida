// Lista de la compra: lógica pura (sin React ni Supabase).
// Vale para las dos listas: «Mi lista» (compra_mia) y «Lista de casa» (compra_casa).

import { ErrorDeValidacion } from './validacion'

export { ErrorDeValidacion }

export const NOMBRE_MAX = 80
export const CANTIDAD_MAX = 30
export const NOTAS_MAX = 300

/** Secciones del súper, en el orden en que se suele recorrer. Las mismas que el check de la base de datos. */
export const SECCIONES = [
  { clave: 'fruta_verdura', nombre: 'Fruta y verdura' },
  { clave: 'carne_pescado', nombre: 'Carne y pescado' },
  { clave: 'lacteos', nombre: 'Lácteos y huevos' },
  { clave: 'panaderia', nombre: 'Panadería' },
  { clave: 'despensa', nombre: 'Despensa' },
  { clave: 'congelados', nombre: 'Congelados' },
  { clave: 'bebidas', nombre: 'Bebidas' },
  { clave: 'limpieza', nombre: 'Limpieza' },
  { clave: 'higiene', nombre: 'Higiene' },
  { clave: 'otros', nombre: 'Otros' },
] as const

export type Seccion = (typeof SECCIONES)[number]['clave']

export function esSeccion(valor: unknown): valor is Seccion {
  return SECCIONES.some((s) => s.clave === valor)
}

export function nombreSeccion(seccion: string | null): string {
  return SECCIONES.find((s) => s.clave === seccion)?.nombre ?? 'Sin sección'
}

export interface ArticuloBasico {
  id: string
  nombre: string
  cantidad: string | null
  seccion: string | null
  comprado: boolean
  comprado_en: string | null
  created_at: string
}

export interface DatosArticulo {
  nombre: string
  cantidad: string | null
  seccion: Seccion | null
  notas: string
}

/**
 * Quita los caracteres de control e invisibles (\p{Cc}, \p{Cf}: inversión de
 * texto, espacios de anchura cero…) salvo los que forman emojis: el ZWJ entre
 * dos pictogramas (👨‍👩‍👧) y las etiquetas de las banderas de subdivisión.
 * `conservar` deja pasar algún control (el salto de línea de las notas).
 */
function sinInvisibles(texto: string, conservar = ''): string {
  return texto.replace(/[\p{Cc}\p{Cf}]/gu, (c, i: number, todo: string) => {
    if (conservar.includes(c)) return c
    if (c === '\u200D') {
      const antes = todo.slice(0, i)
      const despues = todo.slice(i + 1)
      return /\p{Extended_Pictographic}(?:\u{FE0F}|\p{Emoji_Modifier})?$/u.test(antes) && /^\p{Extended_Pictographic}/u.test(despues) ? c : ''
    }
    // Etiquetas solo detrás de la bandera negra (🏴 + etiquetas = Escocia, Gales…): sueltas serían texto oculto
    if (/[\u{E0020}-\u{E007F}]/u.test(c)) return /\u{1F3F4}[\u{E0020}-\u{E007F}]*$/u.test(todo.slice(0, i)) ? c : ''
    return ''
  })
}

// Primero los espacios (un salto de línea o un tabulador en el nombre separa
// palabras, no las junta) y después lo invisible.
const espacios = (texto: string) => sinInvisibles(texto.replace(/\s+/g, ' ')).replace(/\s+/g, ' ').trim()

/** Valida y limpia lo que se escribe en el formulario. Lanza ErrorDeValidacion. */
export function validarArticulo(datos: { nombre: string; cantidad?: string; seccion?: string; notas?: string }): DatosArticulo {
  const nombre = espacios(datos.nombre)
  if (!nombre) throw new ErrorDeValidacion('Escribe qué hay que comprar.')
  if ([...nombre].length > NOMBRE_MAX) throw new ErrorDeValidacion(`El nombre puede tener como mucho ${NOMBRE_MAX} caracteres.`)
  const cantidad = espacios(datos.cantidad ?? '')
  if ([...cantidad].length > CANTIDAD_MAX) throw new ErrorDeValidacion(`La cantidad puede tener como mucho ${CANTIDAD_MAX} caracteres.`)
  const notas = sinInvisibles((datos.notas ?? '').replace(/\r\n?/g, '\n').replace(/\t/g, ' '), '\n').trim()
  if ([...notas].length > NOTAS_MAX) throw new ErrorDeValidacion(`Las notas pueden tener como mucho ${NOTAS_MAX} caracteres.`)
  const seccion = datos.seccion && esSeccion(datos.seccion) ? datos.seccion : null
  return { nombre, cantidad: cantidad || null, seccion, notas }
}

/** Para comparar nombres: sin tildes, sin mayúsculas, sin espacios de más. «Plátanos» = «platanos». */
export function normalizar(nombre: string): string {
  return espacios(nombre).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export interface Grupo<A> {
  seccion: string | null
  nombre: string
  articulos: A[]
}

/**
 * Lo pendiente, agrupado por sección en el orden del súper («Sin sección» al
 * final) y por nombre dentro de cada una. Los comprados van aparte.
 */
export function agruparPorSeccion<A extends ArticuloBasico>(articulos: readonly A[]): { pendientes: Grupo<A>[]; comprados: A[] } {
  const orden = (s: string | null) => {
    const i = SECCIONES.findIndex((x) => x.clave === s)
    return i === -1 ? SECCIONES.length : i
  }
  const porNombre = (a: A, b: A) => a.nombre.localeCompare(b.nombre, 'es') || a.id.localeCompare(b.id)
  const grupos = new Map<string | null, A[]>()
  for (const a of articulos) {
    if (a.comprado) continue
    const clave = esSeccion(a.seccion) ? a.seccion : null
    grupos.set(clave, [...(grupos.get(clave) ?? []), a])
  }
  const pendientes = [...grupos.entries()]
    .sort(([a], [b]) => orden(a) - orden(b))
    .map(([seccion, lista]) => ({ seccion, nombre: nombreSeccion(seccion), articulos: lista.sort(porNombre) }))
  const comprados = articulos
    .filter((a) => a.comprado)
    .sort((a, b) => (b.comprado_en ?? '').localeCompare(a.comprado_en ?? '') || porNombre(a, b))
  return { pendientes, comprados }
}

export interface Sugerencia {
  nombre: string
  seccion: Seccion | null
  veces: number
}

/** Lo que se ha comprado antes (tabla compra_frecuentes, la rellena el servidor). */
export interface Frecuente {
  nombre: string
  seccion: string | null
  veces: number
  ultima: string
}

/**
 * Sugerencias al escribir: lo que más se ha comprado antes, que empiece por
 * lo escrito o tenga una palabra que empiece por ello (sin tildes ni
 * mayúsculas). No sugiere lo que ya está pendiente en la lista ni
 * exactamente lo escrito. Sin texto, devuelve lo más frecuente.
 */
export function sugerencias(escrito: string, frecuentes: readonly Frecuente[], pendientes: readonly ArticuloBasico[], max = 5): Sugerencia[] {
  const buscado = normalizar(escrito)
  const yaEstan = new Set(pendientes.filter((p) => !p.comprado).map((p) => normalizar(p.nombre)))
  // Por si llegan dos con la misma clave (p. ej. tildes que el servidor no quita): se suman
  const cuentas = new Map<string, { nombre: string; seccion: Seccion | null; veces: number; ultima: string }>()
  for (const f of frecuentes) {
    const clave = normalizar(f.nombre)
    if (!clave) continue
    const previa = cuentas.get(clave)
    const seccion = esSeccion(f.seccion) ? f.seccion : null
    if (!previa) cuentas.set(clave, { nombre: espacios(f.nombre), seccion, veces: f.veces, ultima: f.ultima })
    else {
      previa.veces += f.veces
      if (f.ultima > previa.ultima) Object.assign(previa, { ultima: f.ultima, nombre: espacios(f.nombre), seccion: seccion ?? previa.seccion })
    }
  }
  const coincide = (clave: string) => !buscado || clave.startsWith(buscado) || clave.split(' ').some((p) => p.startsWith(buscado))
  return [...cuentas.entries()]
    .filter(([clave]) => clave !== buscado && !yaEstan.has(clave) && coincide(clave))
    .sort(([ca, a], [cb, b]) => {
      // Primero lo que empieza por lo escrito, después lo más comprado y lo más reciente
      const empiezaA = ca.startsWith(buscado) ? 0 : 1
      const empiezaB = cb.startsWith(buscado) ? 0 : 1
      return empiezaA - empiezaB || b.veces - a.veces || b.ultima.localeCompare(a.ultima) || ca.localeCompare(cb)
    })
    .slice(0, max)
    .map(([, s]) => ({ nombre: s.nombre, seccion: s.seccion, veces: s.veces }))
}

/** ¿Ya está pendiente un artículo con ese nombre? (para avisar «ya está en la lista»). */
export function yaPendiente(nombre: string, articulos: readonly ArticuloBasico[]): ArticuloBasico | undefined {
  const clave = normalizar(nombre)
  return articulos.find((a) => !a.comprado && normalizar(a.nombre) === clave)
}
