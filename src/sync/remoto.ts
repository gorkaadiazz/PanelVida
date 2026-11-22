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
  /** El hogar en el que está el usuario (null si en ninguno). Solo si hay tablas compartidas. */
  miHogar?(): Promise<string | null>
  /** Borrados de las tablas compartidas (borrados_hogar), como descargarBorrados. */
  descargarBorradosHogar?(desde: string, desplazamiento: number, limite: number): Promise<Borrado[]>
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

    async miHogar() {
      // Cada persona está como mucho en un hogar, y el RLS solo deja ver los
      // miembros del propio: cualquier fila dice cuál es.
      const { data, error } = await api.from('hogar_miembros').select('hogar_id').limit(1)
      if (error) throw error
      return (data?.[0]?.hogar_id as string | undefined) ?? null
    },

    async descargarBorradosHogar(desde, desplazamiento, limite) {
      const { data, error } = await api
        .from('borrados_hogar')
        .select('tabla, fila_id, sync_at')
        .gt('sync_at', desde)
        .order('sync_at')
        .order('id')
        .range(desplazamiento, desplazamiento + limite - 1)
      if (error) throw error
      return (data ?? []) as Borrado[]
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

/**
 * Tablas de las que se escuchan los cambios en tiempo real (Supabase Realtime).
 * porUsuario: se filtra por user_id (las propias); las del hogar no, porque
 * las filas son de varios (el RLS de Realtime ya filtra por miembro).
 */
export const TABLAS_EN_TIEMPO_REAL: readonly { tabla: string; porUsuario: boolean }[] = [
  { tabla: 'puente', porUsuario: true },
  { tabla: 'compra_casa', porUsuario: false },
  { tabla: 'borrados_hogar', porUsuario: false },
  { tabla: 'hogar_miembros', porUsuario: false },
]

/**
 * Escucha en tiempo real los cambios de esas tablas y llama a `alCambiar`
 * (sin datos: quien escucha simplemente sincroniza, así todo sigue pasando
 * por el motor y la copia local). Realtime aplica las políticas RLS: cada uno
 * solo recibe avisos de sus filas. Devuelve la función para dejar de escuchar.
 */
export function escucharCambios(
  cliente: unknown,
  usuarioId: string,
  tablas: readonly { tabla: string; porUsuario: boolean }[],
  alCambiar: () => void,
): () => void {
  const api = cliente as SupabaseClient
  let canal = api.channel(`cambios-${crypto.randomUUID()}`)
  for (const { tabla, porUsuario } of tablas) {
    if (!porUsuario) {
      canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, () => alCambiar())
      continue
    }
    // El filtro por usuario ahorra avisos ajenos. Ojo: Realtime NO aplica RLS
    // a los DELETE (llegan los de todos, solo con el id). No importa porque
    // aquí no se usa lo que llega: solo se sincroniza, y eso sí pasa por RLS.
    canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla, filter: `user_id=eq.${usuarioId}` }, () => alCambiar())
    // Con filtro, Realtime no entrega los DELETE: se escuchan aparte, sin
    // filtro. Solo dicen «algo se ha borrado» y se sincroniza.
    canal = canal.on('postgres_changes', { event: 'DELETE', schema: 'public', table: tabla }, () => alCambiar())
  }
  canal.subscribe((estado) => {
    // Al (re)conectar puede haberse perdido algún aviso: se sincroniza igualmente.
    if (estado === 'SUBSCRIBED') alCambiar()
  })
  return () => {
    void api.removeChannel(canal)
  }
}
