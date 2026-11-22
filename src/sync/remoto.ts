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

/** Qué se escucha de una tabla en tiempo real. */
export interface EscuchaTiempoReal {
  tabla: string
  eventos: readonly ('INSERT' | 'UPDATE')[]
  /** Filtrar por user_id (solo lo propio). Las del hogar no: son de varios (Realtime ya aplica el RLS). */
  porUsuario: boolean
  /** Además de sincronizar, el hogar puede haber cambiado (repos/useHogar.ts vuelve a preguntar). */
  hogar?: boolean
}

/**
 * Lo que se escucha en tiempo real (Supabase Realtime). NUNCA DELETE:
 * Realtime no aplica el RLS a los borrados y mandaría a todos la clave de
 * las filas borradas de cualquiera. Los borrados se conocen por los INSERT
 * en `borrados` (los propios, filtrados por user_id) y en `borrados_hogar`
 * (RLS por miembro), y los cambios de hogar por `hogar_avisos`.
 */
export const TABLAS_EN_TIEMPO_REAL: readonly EscuchaTiempoReal[] = [
  { tabla: 'puente', eventos: ['INSERT', 'UPDATE'], porUsuario: true },
  { tabla: 'borrados', eventos: ['INSERT'], porUsuario: true },
  { tabla: 'compra_casa', eventos: ['INSERT', 'UPDATE'], porUsuario: false },
  { tabla: 'borrados_hogar', eventos: ['INSERT'], porUsuario: false },
  { tabla: 'hogar_avisos', eventos: ['INSERT'], porUsuario: true, hogar: true },
]

/**
 * Escucha en tiempo real los cambios de esas tablas y llama a `alCambiar`
 * (sin datos: quien escucha simplemente sincroniza, así todo sigue pasando
 * por el motor y la copia local). Realtime aplica las políticas RLS a INSERT
 * y UPDATE. Devuelve la función para dejar de escuchar.
 */
export function escucharCambios(
  cliente: unknown,
  usuarioId: string,
  tablas: readonly EscuchaTiempoReal[],
  alCambiar: (escucha: EscuchaTiempoReal) => void,
): () => void {
  const api = cliente as SupabaseClient
  let canal = api.channel(`cambios-${crypto.randomUUID()}`)
  for (const escucha of tablas) {
    for (const event of escucha.eventos) {
      const filtro = escucha.porUsuario ? { filter: `user_id=eq.${usuarioId}` } : {}
      canal = canal.on('postgres_changes', { event, schema: 'public', table: escucha.tabla, ...filtro }, () => alCambiar(escucha))
    }
  }
  canal.subscribe((estado) => {
    // Al (re)conectar puede haberse perdido algún aviso: se sincroniza igualmente.
    if (estado === 'SUBSCRIBED') alCambiar({ tabla: '', eventos: [], porUsuario: false, hogar: true })
  })
  return () => {
    void api.removeChannel(canal)
  }
}
