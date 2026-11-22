// Repositorio del Mando del PC: mandar órdenes a un PC y ver cómo acaban.
// Necesita conexión (una orden caduca a los 30 segundos).

import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Accion } from '../lib/mando'
import { ErrorDeValidacion } from '../lib/validacion'
import { supabase } from '../lib/supabase'

export interface Comando {
  id: string
  agente_id: string
  accion: string
  valor: string | null
  estado: string
  mensaje: string | null
  caduca_en: string
  created_at: string
}

export async function mandarOrden(agenteId: string, accion: Accion, valor: string | null = null): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new ErrorDeValidacion('Para el Mando del PC hace falta conexión.')
  const { error } = await supabase.from('comandos').insert({ agente_id: agenteId, accion, valor })
  if (error) {
    console.error('Mando', error)
    const m = error.message ?? ''
    throw new ErrorDeValidacion(
      m.includes('Demasiadas') ? 'Demasiadas órdenes seguidas: espera un poco.' : m.includes('app') ? 'Ese PC no sabe abrir esa app.' : 'No se ha podido mandar la orden.',
    )
  }
}

/** Las últimas órdenes de un PC (la más reciente primero). */
export async function ultimasOrdenes(agenteId: string, cuantas = 5): Promise<Comando[]> {
  const { data, error } = await supabase
    .from('comandos')
    .select('id, agente_id, accion, valor, estado, mensaje, caduca_en, created_at')
    .eq('agente_id', agenteId)
    .order('created_at', { ascending: false })
    .limit(cuantas)
  if (error) throw new ErrorDeValidacion('No se han podido leer las órdenes.')
  return data ?? []
}

/** Avisa cuando se crea o cambia una orden tuya (el agente cuenta cómo ha ido). */
export function escucharOrdenes(usuarioId: string, alCambiar: () => void): () => void {
  let canal: RealtimeChannel | null = supabase
    .channel(`ordenes-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comandos', filter: `user_id=eq.${usuarioId}` }, () => alCambiar())
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'comandos', filter: `user_id=eq.${usuarioId}` }, () => alCambiar())
    .subscribe()
  return () => {
    if (canal) void supabase.removeChannel(canal)
    canal = null
  }
}
