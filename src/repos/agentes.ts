// Repositorio de los PC vinculados (agentes). Necesita conexión: es el estado
// de ahora mismo (encendido o apagado), no algo para guardar sin red.

import type { RealtimeChannel } from '@supabase/supabase-js'
import { ErrorDeValidacion } from '../lib/validacion'
import { supabase } from '../lib/supabase'

export interface PC {
  id: string
  nombre: string
  ultimo_latido: string | null
  apps: string[]
  version: string | null
  created_at: string
}

const SIN_CONEXION = 'Para esto hace falta conexión.'

function comprobarConexion() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new ErrorDeValidacion(SIN_CONEXION)
}

export async function listarPCs(): Promise<PC[]> {
  comprobarConexion()
  const { data, error } = await supabase.from('agentes').select('id, nombre, ultimo_latido, apps, version, created_at').order('created_at')
  if (error) {
    console.error('PC vinculados', error)
    throw new ErrorDeValidacion('No se han podido leer tus PC.')
  }
  return data ?? []
}

/** Código para `mipanel-agente vincular` (dura 10 minutos y sirve una vez). */
export async function crearCodigoVinculacion(): Promise<{ codigo: string; caduca_en: string }> {
  comprobarConexion()
  const { data, error } = await supabase.rpc('crear_codigo_vinculacion')
  const fila = Array.isArray(data) ? data[0] : data
  if (error || !fila?.codigo) {
    console.error('Vincular', error)
    const m = error?.message ?? ''
    throw new ErrorDeValidacion(
      m.includes('5 PC') ? 'Ya tienes 5 PC vinculados: desvincula alguno.' : m.includes('3 códigos') ? 'Ya tienes 3 códigos sin usar: espera a que caduquen.' : 'No se ha podido crear el código.',
    )
  }
  return fila
}

export async function renombrarPC(id: string, nombre: string): Promise<void> {
  comprobarConexion()
  const limpio = nombre.replace(/\s+/g, ' ').trim()
  if (!limpio || [...limpio].length > 40) throw new ErrorDeValidacion('Escribe un nombre de hasta 40 caracteres.')
  const { error } = await supabase.from('agentes').update({ nombre: limpio }).eq('id', id)
  if (error) throw new ErrorDeValidacion('No se ha podido cambiar el nombre.')
}

/**
 * Desvincula un PC: deja de funcionar al momento. La Edge Function borra su
 * fila (lo que corta el acceso) y su usuario. Si no se puede llamar a la
 * función, se borra la fila desde aquí: el acceso se corta igual (solo queda
 * un usuario sin uso).
 */
export async function desvincularPC(id: string): Promise<void> {
  comprobarConexion()
  const { error: errorFuncion } = await supabase.functions.invoke('agentes', { body: { accion: 'desvincular', agenteId: id } })
  if (!errorFuncion) return
  console.warn('Edge Function agentes', errorFuncion)
  const { error } = await supabase.from('agentes').delete().eq('id', id)
  if (error) throw new ErrorDeValidacion('No se ha podido desvincular.')
}

/** Avisa cuando cambia algo de tus PC (el latido de cada minuto, el nombre…). */
export function escucharPCs(usuarioId: string, alCambiar: () => void): () => void {
  let canal: RealtimeChannel | null = supabase
    .channel(`pcs-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agentes', filter: `user_id=eq.${usuarioId}` }, () => alCambiar())
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'agentes', filter: `user_id=eq.${usuarioId}` }, () => alCambiar())
    .subscribe()
  return () => {
    if (canal) void supabase.removeChannel(canal)
    canal = null
  }
}
