// Lo que el motor de sincronización necesita del servidor, y su versión real
// con Supabase. Es el ÚNICO archivo de sync/ que habla con Supabase: en los
// tests se cambia por un servidor de mentira en memoria.

import type { SupabaseClient } from '@supabase/supabase-js'
import { columnasDeDescarga, type Fila } from './tablas'

export interface FilaRemota extends Fila {
  sync_at: string
}

export interface Borrado {
  tabla: string
  fila_id: string
  sync_at: string
}

/**
 * Todas las funciones lanzan el error de Supabase tal cual (con `code`,
 * `message`, `details`): reglas.ts decide si es de red, de datos o transitorio.
 */
export interface Remoto {
  /** RPC idempotente que crea los datos iniciales de la cuenta. true si ha creado algo. */
  inicializarCuenta(): Promise<boolean>
  /** Crea o actualiza filas (upsert por id). En un conflicto, el servidor se queda con el updated_at más reciente. */
  guardar(tabla: string, filas: readonly Record<string, unknown>[]): Promise<void>
  borrar(tabla: string, ids: readonly string[]): Promise<void>
  /** Filas con esos id tal como están en el servidor (las que no existan no vienen). */
  obtener(tabla: string, ids: readonly string[]): Promise<FilaRemota[]>
  /** Filas con sync_at posterior a `desde` (null = todas), por orden de sync_at, paginadas. */
  descargar(tabla: string, desde: string | null, desplazamiento: number, limite: number): Promise<FilaRemota[]>
  /** Borrados apuntados después de `desde`, por orden, paginados. */
  descargarBorrados(desde: string, desplazamiento: number, limite: number): Promise<Borrado[]>
}

/**
 * Remoto real. El cliente llega tipado con el esquema de la app, pero aquí el
 * nombre de la tabla es un dato (el motor es genérico), así que se usa con el
 * tipado genérico de supabase-js. Qué columnas viajan lo decide
 * reglas.limpiarFila; qué filas puede tocar cada uno, las políticas RLS.
 */
export function crearRemotoSupabase(cliente: unknown): Remoto {
  const api = cliente as SupabaseClient

  return {
    async inicializarCuenta() {
      const { data, error } = await api.rpc('inicializar_cuenta')
      if (error) throw error
      return data === true
    },

    async guardar(tabla, filas) {
      if (!filas.length) return
      const { error } = await api.from(tabla).upsert([...filas], { onConflict: 'id' })
      if (error) throw error
    },

    async borrar(tabla, ids) {
      if (!ids.length) return
      const { error } = await api.from(tabla).delete().in('id', [...ids])
      if (error) throw error
    },

    async obtener(tabla, ids) {
      if (!ids.length) return []
      const { data, error } = await api.from(tabla).select(columnasDeDescarga(tabla)).in('id', [...ids])
      if (error) throw error
      return (data ?? []) as unknown as FilaRemota[]
    },

    async descargar(tabla, desde, desplazamiento, limite) {
      let consulta = api.from(tabla).select(columnasDeDescarga(tabla))
      if (desde) consulta = consulta.gt('sync_at', desde)
      const { data, error } = await consulta
        .order('sync_at')
        .order('id')
        .range(desplazamiento, desplazamiento + limite - 1)
      if (error) throw error
      return (data ?? []) as unknown as FilaRemota[]
    },

    async descargarBorrados(desde, desplazamiento, limite) {
      const { data, error } = await api
        .from('borrados')
        .select('tabla, fila_id, sync_at')
        .gt('sync_at', desde)
        .order('sync_at')
        .order('id')
        .range(desplazamiento, desplazamiento + limite - 1)
      if (error) throw error
      return (data ?? []) as Borrado[]
    },
  }
}
