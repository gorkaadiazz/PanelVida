// Puente móvil ⇄ PC: lógica pura (sin React ni Supabase).
//
// Lo que se manda puede ser texto, un enlace o un archivo. Aquí se decide
// qué es cada cosa, se valida igual que lo hace la base de datos (los check
// de la migración 20261122000100) y se calcula cuándo caduca.

import { diaEnMadrid, restarDias } from './fechas'
import { ErrorDeValidacion } from './validacion'

export { ErrorDeValidacion }

export type TipoPuente = 'texto' | 'enlace' | 'archivo'

export const CONTENIDO_MAX = 10000
/** 25 MB: el mismo límite que el bucket `puente`. */
export const ARCHIVO_MAX_BYTES = 25 * 1024 * 1024
export const DISPOSITIVO_MAX = 40
export const NOMBRE_ARCHIVO_MAX = 120
/** Lo no fijado se borra en el servidor a los 7 días. */
export const DIAS_CADUCIDAD = 7

const DIA_MS = 24 * 60 * 60 * 1000

export interface ElementoBasico {
  id: string
  tipo: string
  fijado: boolean
  created_at: string
}

/**
 * Un texto que es solo un enlace http(s) (sin espacios) se guarda como
 * enlace, para poder abrirlo con un toque. Cualquier otra cosa es texto.
 */
export function tipoDeTexto(texto: string): 'texto' | 'enlace' {
  return /^https?:\/\/\S+$/i.test(texto) && esEnlaceSeguro(texto) ? 'enlace' : 'texto'
}

/** Solo se abren enlaces http y https (nunca javascript:, data:, file:…). */
export function esEnlaceSeguro(texto: string): boolean {
  try {
    const url = new URL(texto)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** Valida lo escrito y decide si es texto o enlace. Lanza ErrorDeValidacion. */
export function prepararTexto(texto: string): { tipo: 'texto' | 'enlace'; contenido: string } {
  // Al texto no se le tocan los espacios de dentro (puede ser código), solo los extremos.
  // Se quitan las líneas en blanco del principio y los espacios del final; una sola línea, también los del principio.
  let contenido = texto.replace(/^(?:[ \t]*\r?\n)+/, '').trimEnd()
  if (!contenido.includes('\n')) contenido = contenido.trimStart()
  if (!contenido.trim()) throw new ErrorDeValidacion('Escribe o pega algo para mandar.')
  if (contenido.length > CONTENIDO_MAX) throw new ErrorDeValidacion(`Como mucho ${CONTENIDO_MAX.toLocaleString('es-ES')} caracteres.`)
  const unaLinea = contenido.trim()
  if (tipoDeTexto(unaLinea) === 'enlace') return { tipo: 'enlace', contenido: unaLinea }
  return { tipo: 'texto', contenido }
}

/**
 * Recorta a `max` unidades sin partir un emoji por la mitad: medio emoji (un
 * surrogate suelto) no es JSON válido para Postgres y el servidor rechazaría
 * la fila entera.
 */
function recortar(texto: string, max: number): string {
  const corto = texto.slice(0, max)
  return /[\uD800-\uDBFF]$/.test(corto) ? corto.slice(0, -1) : corto
}

/**
 * Nombre de archivo apto para la ruta de Storage: sin barras, sin «..», sin
 * caracteres de control y no muy largo (conservando la extensión).
 */
export function nombreSeguro(nombre: string): string {
  let limpio = nombre
    .normalize('NFC')
    .replace(/[\\/]/g, '_')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/g, ' ')
    // Ni punto ni espacio al principio (también mezclados: «. .env»)
    .replace(/^[.\s]+/, '')
    .trim()
  if (!limpio) limpio = 'archivo'
  if (limpio.length > NOMBRE_ARCHIVO_MAX) {
    const punto = limpio.lastIndexOf('.')
    const ext = punto > 0 && limpio.length - punto <= 10 ? limpio.slice(punto) : ''
    limpio = recortar(limpio, NOMBRE_ARCHIVO_MAX - ext.length).trimEnd() + ext
  }
  return limpio
}

/**
 * Nombre del archivo DENTRO de la ruta de Storage: solo caracteres que
 * Storage acepta siempre (el nombre original se guarda aparte, en la fila).
 */
export function nombreParaRuta(nombre: string): string {
  const base = nombreSeguro(nombre)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|-+$/g, '')
  return (base || 'archivo').slice(0, 100)
}

/** Ruta del archivo en el bucket: {usuario}/{id de la fila}/{nombre}. */
export function rutaArchivo(usuarioId: string, id: string, nombre: string): string {
  return `${usuarioId}/${id}/${nombreParaRuta(nombre)}`
}

/** Comprueba un archivo antes de subirlo. Lanza ErrorDeValidacion. */
export function validarArchivo(archivo: { name: string; size: number }): void {
  if (archivo.size <= 0) throw new ErrorDeValidacion('Ese archivo está vacío.')
  if (archivo.size > ARCHIVO_MAX_BYTES) throw new ErrorDeValidacion('El archivo pasa de 25 MB, el máximo del Puente.')
}

/** Lo más nuevo arriba; los fijados, aparte (también los más nuevos primero). */
export function ordenarPuente<E extends ElementoBasico>(elementos: readonly E[]): { fijados: E[]; recientes: E[] } {
  const orden = [...elementos].sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))
  return { fijados: orden.filter((e) => e.fijado), recientes: orden.filter((e) => !e.fijado) }
}

/** Días que le quedan a un elemento no fijado (0 = se borra en la próxima limpieza). null si está fijado. */
export function diasParaCaducar(elemento: ElementoBasico, ahora: number): number | null {
  if (elemento.fijado) return null
  const creado = Date.parse(elemento.created_at)
  if (Number.isNaN(creado)) return null
  // Nunca más de 7: lo creado después de «ahora» (la página lo fija al abrirse) diría 8
  return Math.min(DIAS_CADUCIDAD, Math.max(0, Math.ceil((creado + DIAS_CADUCIDAD * DIA_MS - ahora) / DIA_MS)))
}

/** «Se borra en 3 días», «Se borra mañana», «Se borra hoy». */
export function textoCaducidad(dias: number | null): string | null {
  if (dias === null) return null
  if (dias <= 0) return 'Se borra hoy'
  if (dias === 1) return 'Se borra mañana'
  return `Se borra en ${dias} días`
}

/** Tamaño legible en español: «850 B», «12,3 KB», «4,2 MB». */
export function formatearBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const fmt = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 })
  if (bytes < 1024 * 1024) return `${fmt.format(bytes / 1024)} KB`
  return `${fmt.format(bytes / (1024 * 1024))} MB`
}

/** Nombre del dispositivo: recortado y sin espacios de más. Vacío → el de por defecto. */
export function limpiarNombreDispositivo(nombre: string, porDefecto: string): string {
  const limpio = recortar(nombre.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim(), DISPOSITIVO_MAX).trimEnd()
  return limpio || porDefecto
}

/** Primer nombre del dispositivo, adivinado por el navegador (se puede cambiar). */
export function dispositivoPorDefecto(userAgent: string): string {
  if (/Android|iPhone|iPod|Mobile/i.test(userAgent)) return 'Móvil'
  if (/iPad|Tablet/i.test(userAgent)) return 'Tableta'
  return 'PC'
}

/** Primera línea de un elemento, para el Inicio o una notificación. */
export function resumenElemento(e: { tipo: string; contenido: string; archivo_nombre: string | null }, max = 80): string {
  const texto = e.tipo === 'archivo' ? (e.archivo_nombre ?? 'Archivo') : (e.contenido.split('\n').find((l) => l.trim()) ?? '').trim()
  return texto.length <= max ? texto : `${texto.slice(0, max - 1).trimEnd()}…`
}

const HORA = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' })
const DIA = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' })

/** Cuándo se mandó, en hora de Madrid: «hoy, 17:40», «ayer, 09:05» o «20/11/2026, 18:00». */
export function cuandoSeEnvio(instante: string, ahora: number): string {
  const t = Date.parse(instante)
  if (Number.isNaN(t)) return ''
  const hora = HORA.format(t)
  // Se comparan días de calendario de Madrid (no «ahora − 24 h»: los días del
  // cambio de hora duran 23 o 25 horas).
  const dia = diaEnMadrid(t)
  const hoyMadrid = diaEnMadrid(ahora)
  if (dia === hoyMadrid) return `hoy, ${hora}`
  if (dia === restarDias(hoyMadrid, 1)) return `ayer, ${hora}`
  return `${DIA.format(t)}, ${hora}`
}

/**
 * Lo que llega al compartir desde Android (título, texto y enlace) en un solo
 * texto, sin repetir. Al compartir una web suele llegar el título y el
 * enlace: entonces se queda solo el enlace, para poder abrirlo con un toque.
 */
export function unirCompartido(titulo: string, texto: string, enlace: string): string {
  const partes: string[] = []
  for (const parte of [titulo, texto, enlace].map((p) => p.trim())) {
    if (parte && !partes.some((p) => p.includes(parte))) partes.push(parte)
  }
  const enlaces = partes.filter((p) => tipoDeTexto(p) === 'enlace')
  if (enlaces.length === 1 && partes.length <= 2 && (partes.length === 1 || partes[0] === titulo.trim())) return enlaces[0]
  return partes.join('\n')
}
