// Repositorio del vigilante de la red. Necesita conexión (es el estado de tu
// red ahora mismo; lo escribe el agente del PC cada 5 minutos).

import type { RealtimeChannel } from '@supabase/supabase-js'
import { validarNombreAparato, type Aparato, type Intervalo } from '../lib/red'
import { ErrorDeValidacion } from '../lib/validacion'
import { supabase } from '../lib/supabase'

const COLUMNAS = 'id, mac, nombre, fabricante, ip, aleatoria, conectado, conocido, unido_a, primera_vez, ultima_vez'

function comprobarConexion() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new ErrorDeValidacion('Para ver la red hace falta conexión.')
}

export async function listarAparatos(): Promise<Aparato[]> {
  comprobarConexion()
  const { data, error } = await supabase.from('red_dispositivos').select(COLUMNAS).limit(1000)
  if (error) {
    console.error('Red', error)
    throw new ErrorDeValidacion('No se ha podido leer tu red.')
  }
  return data ?? []
}

async function cambiar(id: string, cambios: { nombre?: string | null; conocido?: boolean; unido_a?: string | null }) {
  comprobarConexion()
  const { error } = await supabase.from('red_dispositivos').update(cambios).eq('id', id)
  if (error) {
    console.error('Red', error)
    throw new ErrorDeValidacion('No se ha podido guardar el cambio.')
  }
}

export function renombrarAparato(id: string, nombre: string) {
  return cambiar(id, { nombre: validarNombreAparato(nombre) })
}

export function marcarConocido(id: string, conocido: boolean) {
  return cambiar(id, { conocido })
}

/** «Es el mismo que…»: une un aparato (p. ej. una MAC aleatoria nueva) con uno conocido. */
export function unirAparato(id: string, conId: string | null) {
  if (conId === id) throw new ErrorDeValidacion('No se puede unir un aparato consigo mismo.')
  return cambiar(id, { unido_a: conId, ...(conId ? { conocido: true } : {}) })
}

export async function borrarAparato(id: string): Promise<void> {
  comprobarConexion()
  const { error } = await supabase.from('red_dispositivos').delete().eq('id', id)
  if (error) throw new ErrorDeValidacion('No se ha podido borrar.')
}

/** Historial (últimos 30 días) de uno o varios aparatos (un grupo unido), lo más reciente primero. */
export async function historial(ids: readonly string[]): Promise<Intervalo[]> {
  comprobarConexion()
  const { data, error } = await supabase.from('red_conexiones').select('desde, hasta').in('dispositivo_id', [...ids]).order('hasta', { ascending: false }).limit(200)
  if (error) throw new ErrorDeValidacion('No se ha podido leer el historial.')
  return data ?? []
}

/** Avisa cuando el agente manda un escaneo o cambias algo (lo tuyo). */
export function escucharRed(usuarioId: string, alCambiar: () => void): () => void {
  let canal: RealtimeChannel | null = supabase
    .channel(`red-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'red_dispositivos', filter: `user_id=eq.${usuarioId}` }, () => alCambiar())
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'red_dispositivos', filter: `user_id=eq.${usuarioId}` }, () => alCambiar())
    .subscribe()
  return () => {
    if (canal) void supabase.removeChannel(canal)
    canal = null
  }
}
