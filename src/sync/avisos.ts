// Avisos internos de la capa de sincronización (sin React):
//  · "han cambiado los datos de estas tablas" -> los hooks vuelven a leer.
//  · "ha cambiado el estado de la sincronización" -> el indicador se repinta.
// Sustituye a js/utils/eventos.js de la app de exámenes, con la forma que
// necesita useSyncExternalStore (suscribir + leer una instantánea).

export type OrigenCambio = 'local' | 'remoto' | 'otra-pestana'

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

const versiones = new Map<string, number>()
let versionGlobal = 0
const oyentesDatos = new Set<() => void>()
const oyentesLocales = new Set<(tablas: readonly string[]) => void>()

// Otras pestañas de la app comparten la misma copia local: se les avisa para
// que también repinten. Solo viaja el nombre de las tablas, nunca datos.
const NOMBRE_CANAL = 'mi-panel-sync'
let canal: BroadcastChannel | null = null

function abrirCanal(): BroadcastChannel | null {
  if (canal || typeof BroadcastChannel === 'undefined') return canal
  canal = new BroadcastChannel(NOMBRE_CANAL)
  canal.onmessage = (evento: MessageEvent<unknown>) => {
    const dato = evento.data
    if (Array.isArray(dato) && dato.every((x) => typeof x === 'string')) subirVersiones(dato)
  }
  // En Node (tests) un canal abierto impediría que el proceso terminase
  const nodo = canal as BroadcastChannel & { unref?: () => void }
  nodo.unref?.()
  return canal
}

function subirVersiones(tablas: readonly string[]) {
  if (!tablas.length) return
  for (const tabla of tablas) versiones.set(tabla, (versiones.get(tabla) ?? 0) + 1)
  for (const fn of [...oyentesDatos]) fn()
}

/** Avisa de que han cambiado filas de estas tablas en la copia local. */
export function avisarCambio(tablas: readonly string[], origen: OrigenCambio) {
  if (!tablas.length) return
  subirVersiones(tablas)
  if (origen !== 'otra-pestana') {
    try {
      abrirCanal()?.postMessage([...tablas])
    } catch {
      // Sin canal no pasa nada: la otra pestaña se pondrá al día al sincronizar
    }
  }
  if (origen === 'local') for (const fn of [...oyentesLocales]) fn(tablas)
}

/** Avisa a todos los lectores (p. ej. al vaciar la copia local). */
export function avisarTodo() {
  versionGlobal += 1
  for (const fn of [...oyentesDatos]) fn()
}

/** Para useSyncExternalStore: se llama a `fn` cuando cambia cualquier tabla. */
export function suscribirDatos(fn: () => void): () => void {
  abrirCanal()
  oyentesDatos.add(fn)
  return () => {
    oyentesDatos.delete(fn)
  }
}

/** Número que cambia cada vez que cambia alguna de estas tablas. */
export function versionDe(tablas: readonly string[]): number {
  let total = versionGlobal
  for (const tabla of tablas) total += versiones.get(tabla) ?? 0
  return total
}

/** Se llama a `fn` con cada cambio hecho EN ESTA pestaña (para programar la subida). */
export function alCambioLocal(fn: (tablas: readonly string[]) => void): () => void {
  oyentesLocales.add(fn)
  return () => {
    oyentesLocales.delete(fn)
  }
}

// ---------------------------------------------------------------------------
// Estado de la sincronización
// ---------------------------------------------------------------------------

export type FaseSync = 'inactivo' | 'sincronizando' | 'sincronizado' | 'sin-conexion' | 'error'

export interface EstadoSync {
  /**
   * inactivo: sin sesión o aún no ha empezado · sincronizando · sincronizado ·
   * sin-conexion: se reintentará sola al volver la red · error: ha fallado
   * (se reintenta sola; `error` trae el mensaje).
   */
  fase: FaseSync
  /** Atajo de `fase === 'sincronizando'`. */
  sincronizando: boolean
  /** Cambios hechos en este dispositivo que aún no se han subido. */
  pendientes: number
  /** Mensaje para el usuario cuando `fase === 'error'`; si no, null. */
  error: string | null
  /** Cambios que el servidor ha rechazado (y se han descartado) en esta sesión. */
  rechazados: number
  /** Instante (ISO) de la última sincronización completa en esta sesión. */
  ultimaSincronizacion: string | null
  /**
   * true cuando este dispositivo ya ha descargado los datos de la cuenta al
   * menos una vez. Mientras sea false, una lista vacía puede significar "aún
   * no ha llegado nada", no "no tienes nada".
   */
  primeraDescargaHecha: boolean
}

export const ESTADO_INICIAL: EstadoSync = Object.freeze({
  fase: 'inactivo',
  sincronizando: false,
  pendientes: 0,
  error: null,
  rechazados: 0,
  ultimaSincronizacion: null,
  primeraDescargaHecha: false,
})

let estado: EstadoSync = ESTADO_INICIAL
const oyentesEstado = new Set<() => void>()

/** Instantánea del estado (el mismo objeto mientras no cambie nada). */
export function estadoSync(): EstadoSync {
  return estado
}

export function suscribirEstado(fn: () => void): () => void {
  oyentesEstado.add(fn)
  return () => {
    oyentesEstado.delete(fn)
  }
}

export function ponerEstado(cambios: Partial<Omit<EstadoSync, 'sincronizando'>>) {
  const nuevo: EstadoSync = { ...estado, ...cambios }
  nuevo.sincronizando = nuevo.fase === 'sincronizando'
  const claves = Object.keys(nuevo) as (keyof EstadoSync)[]
  if (claves.every((k) => nuevo[k] === estado[k])) return
  estado = Object.freeze(nuevo)
  for (const fn of [...oyentesEstado]) fn()
}

/** Vuelve al estado inicial (cierre de sesión). */
export function reiniciarEstado() {
  ponerEstado(ESTADO_INICIAL)
}
