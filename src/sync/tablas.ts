// Tablas que se sincronizan entre la copia local (IndexedDB) y Supabase.
//
// AÑADIR UNA TABLA en una fase posterior (movimientos, clientes_web,
// exámenes…) es añadir aquí su declaración: el almacén local, la cola, la
// subida y la descarga salen solos (la base local se amplía sola al abrirla).
//
// El ORDEN de la lista importa: los padres van antes que sus hijos. Al subir
// se recorre en este orden (el hábito tiene que existir antes que su marca) y
// al borrar, al revés.

import type { Database } from '../lib/database.types'

type TablasPublicas = Database['public']['Tables']

/** Columnas que tienen todas las tablas sincronizables y se suben siempre. */
export const COLUMNAS_COMUNES = ['id', 'created_at', 'updated_at'] as const

export interface DefTabla<N extends string = string> {
  /** Nombre de la tabla en Supabase y del almacén en IndexedDB. */
  nombre: N
  /**
   * Columnas propias que se suben (además de las comunes). Lo que no esté
   * aquí no se envía: `user_id` y `sync_at` los pone el servidor.
   */
  columnas: readonly string[]
  /** Columnas por las que se busca en la copia local (índices de IndexedDB). */
  indices?: readonly string[]
  /**
   * Tabla madre: al borrar la madre, el servidor borra las hijas en cascada
   * (`on delete cascade`) y la copia local hace lo mismo.
   */
  padre?: { tabla: string; columna: string }
  /** Solo se descarga (la escribe el servidor); nunca se sube. */
  soloLectura?: boolean
}

export const TABLAS = [
  { nombre: 'habitos', columnas: ['nombre', 'orden', 'archivado'] },
  {
    nombre: 'habito_marcas',
    columnas: ['habito_id', 'fecha', 'hecho'],
    indices: ['habito_id', 'fecha'],
    padre: { tabla: 'habitos', columna: 'habito_id' },
  },
  { nombre: 'tareas', columnas: ['texto', 'fecha_limite', 'hecha', 'hecha_en'] },
] as const satisfies readonly DefTabla<keyof TablasPublicas>[]

/** Nombre de una tabla sincronizable. */
export type NombreTabla = (typeof TABLAS)[number]['nombre']

/**
 * Fila tal como está en la copia local. `user_id` y `sync_at` los pone el
 * servidor: una fila creada aquí no los tiene hasta que se descarga.
 */
export type FilaLocal<T extends NombreTabla> = Omit<TablasPublicas[T]['Row'], 'user_id' | 'sync_at'> & {
  user_id?: string
  sync_at?: string
}

/** Forma mínima de cualquier fila sincronizable (para el motor, que es genérico). */
export interface Fila {
  id: string
  created_at: string
  updated_at: string
  sync_at?: string
  [columna: string]: unknown
}

const LISTA: readonly DefTabla[] = TABLAS

export function esTabla(nombre: string, tablas: readonly DefTabla[] = LISTA): boolean {
  return tablas.some((t) => t.nombre === nombre)
}

export function definicion(nombre: string, tablas: readonly DefTabla[] = LISTA): DefTabla {
  const def = tablas.find((t) => t.nombre === nombre)
  if (!def) throw new Error(`La tabla "${nombre}" no está declarada en sync/tablas.ts`)
  return def
}

/** Tablas hijas directas de `nombre` (las que se borran en cascada con ella). */
export function hijasDe(nombre: string, tablas: readonly DefTabla[] = LISTA): { tabla: string; columna: string }[] {
  return tablas.flatMap((t) => (t.padre?.tabla === nombre ? [{ tabla: t.nombre, columna: t.padre.columna }] : []))
}

/** Índices locales de una tabla: los declarados más la columna que apunta a su madre. */
export function indicesDe(def: DefTabla): string[] {
  return [...new Set([...(def.indices ?? []), ...(def.padre ? [def.padre.columna] : [])])]
}
