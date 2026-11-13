// Reglas de la sincronización, sin efectos secundarios: no tocan IndexedDB ni
// la red, así que se prueban con `npm test` sin navegador ni Supabase.
// (Portado de js/sync/reglas.js de la app de exámenes.)

import { COLUMNAS_COMUNES, type DefTabla, type Fila } from './tablas'

export type Operacion = 'upsert' | 'delete'

/** Un cambio local pendiente de subir. Hay como mucho uno por fila. */
export interface EntradaCola {
  /** "tabla:id" */
  clave: string
  tabla: string
  op: Operacion
  id: string
  /** Cuándo se apuntó (ISO). */
  fecha: string
  /** Identifica esta versión del cambio (por si la fila vuelve a cambiar mientras se sube). */
  rev: string
}

export const claveCola = (tabla: string, id: string) => `${tabla}:${id}`

/** Filas por petición al subir. */
export const TROZO_SUBIDA = 200
/** Filas por petición al descargar. */
export const PAGINA_DESCARGA = 1000
/** Al descargar se vuelve a pedir el último minuto, por si acaso. */
export const MARGEN_DESCARGA_MS = 60_000

// ---------------------------------------------------------------------------
// Subida
// ---------------------------------------------------------------------------

/** Copia de la fila solo con las columnas que se envían a Supabase. */
export function limpiarFila(def: DefTabla, fila: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const limpia: Record<string, unknown> = {}
  for (const col of [...COLUMNAS_COMUNES, ...def.columnas]) {
    if (fila[col] !== undefined) limpia[col] = fila[col]
  }
  return limpia
}

export function trocear<T>(lista: readonly T[], tamano: number): T[][] {
  const trozos: T[][] = []
  for (let i = 0; i < lista.length; i += tamano) trozos.push(lista.slice(i, i + tamano))
  return trozos
}

export interface Lote {
  tabla: string
  entradas: EntradaCola[]
}

export interface PlanDeSubida {
  /** Guardados: padres antes que hijos (orden de TABLAS), en trozos. */
  guardar: Lote[]
  /** Borrados: hijos antes que padres (orden inverso), en trozos. */
  borrar: Lote[]
  /** Entradas de tablas desconocidas o de solo lectura: se quitan de la cola sin subir. */
  descartar: EntradaCola[]
}

/**
 * Decide en qué orden se sube la cola: primero todos los guardados, de las
 * tablas madre a las hijas (para que exista el hábito antes que su marca), y
 * después los borrados, de las hijas a las madres. Dentro de cada tabla, del
 * cambio más antiguo al más nuevo.
 */
export function planDeSubida(cola: readonly EntradaCola[], tablas: readonly DefTabla[], tamano: number = TROZO_SUBIDA): PlanDeSubida {
  const subibles = tablas.filter((t) => !t.soloLectura).map((t) => t.nombre)
  const ordenadas = [...cola].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.clave.localeCompare(b.clave))
  const lotes = (op: Operacion, nombres: readonly string[]) =>
    nombres.flatMap((tabla) =>
      trocear(
        ordenadas.filter((e) => e.tabla === tabla && e.op === op),
        tamano,
      ).map((entradas) => ({ tabla, entradas })),
    )
  return {
    guardar: lotes('upsert', subibles),
    borrar: lotes('delete', [...subibles].reverse()),
    descartar: ordenadas.filter((e) => !subibles.includes(e.tabla)),
  }
}

// ---------------------------------------------------------------------------
// Descarga y conflictos
// ---------------------------------------------------------------------------

type ConFechas = Pick<Fila, 'updated_at'> & { sync_at?: string }

/** ¿La fila local es ya exactamente la versión que manda el servidor? */
export function esLaMismaVersion(local: ConFechas | undefined, remota: ConFechas): boolean {
  if (!local?.sync_at || !remota.sync_at) return false
  return Date.parse(local.updated_at) === Date.parse(remota.updated_at) && Date.parse(local.sync_at) === Date.parse(remota.sync_at)
}

/**
 * Llega una fila del servidor: ¿se guarda en la copia local?
 *  - Sin cambios locales pendientes: manda el servidor.
 *  - Aquí se borró: se ignora (se subirá el borrado).
 *  - Los dos han cambiado: gana el `updated_at` más reciente; si empatan, se
 *    queda el local (que se subirá y el servidor lo aceptará).
 * Es la misma regla que aplica el trigger `antes_de_guardar` al subir.
 */
export function decidirDescarga(
  local: Pick<Fila, 'updated_at'> | undefined,
  pendiente: Pick<EntradaCola, 'op'> | undefined,
  remota: Pick<Fila, 'updated_at'>,
): 'aplicar' | 'ignorar' {
  if (!pendiente) return 'aplicar'
  if (pendiente.op === 'delete') return 'ignorar'
  if (!local) return 'aplicar'
  return Date.parse(remota.updated_at) > Date.parse(local.updated_at) ? 'aplicar' : 'ignorar'
}

/** La marca de tiempo más reciente de las dos (cualquiera puede faltar). */
export function masReciente(a: string | null, b: string | null | undefined): string | null {
  if (!b) return a
  if (!a) return b
  return Date.parse(b) > Date.parse(a) ? b : a
}

/** Desde cuándo pedir cambios: la última descarga menos un margen. null = todo. */
export function desdeConMargen(ultima: string | null, margenMs: number = MARGEN_DESCARGA_MS): string | null {
  if (!ultima) return null
  const ms = Date.parse(ultima)
  return Number.isNaN(ms) ? null : new Date(ms - margenMs).toISOString()
}

// ---------------------------------------------------------------------------
// Errores
// ---------------------------------------------------------------------------

/** Lo que se sabe de un error de Supabase/PostgREST o de fetch. */
export interface DatosDeError {
  message?: string
  code?: string
  details?: string
  status?: number
}

export function datosDeError(e: unknown): DatosDeError {
  if (typeof e !== 'object' || e === null) return { message: typeof e === 'string' ? e : undefined }
  const o = e as Record<string, unknown>
  return {
    message: typeof o.message === 'string' ? o.message : undefined,
    code: typeof o.code === 'string' && o.code ? o.code : undefined,
    details: typeof o.details === 'string' ? o.details : undefined,
    status: typeof o.status === 'number' ? o.status : undefined,
  }
}

/** No se pudo hablar con el servidor: se reintenta cuando vuelva la conexión. */
export function esErrorDeRed(e: unknown): boolean {
  const { message = '', details = '', code } = datosDeError(e)
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(`${message} ${details}`) && !code
}

/**
 * El servidor ha rechazado ESTA fila (restricción, tipo de dato o RLS):
 * reintentar no lo arregla. La fila se descarta de la cola para no bloquear
 * el resto. Códigos de Postgres 22xxx (dato no válido), 23xxx (restricción)
 * y 42501 cuando es una política RLS la que rechaza la fila.
 */
export function esErrorDeDatos(e: unknown): boolean {
  const { code = '', message = '' } = datosDeError(e)
  if (/^(22|23)/.test(code)) return true
  // 42501 significa dos cosas distintas: "esta fila incumple la política RLS"
  // (culpa de la fila: se descarta) o "permiso denegado para la tabla" (la
  // petición ha ido sin sesión válida: NO es culpa de la fila, se reintenta).
  return code === '42501' && /row-level security/i.test(message)
}
