// Recordatorios: suscripción Web Push de ESTE navegador y su fila en
// Supabase (suscripciones_push). A diferencia del resto, necesita conexión:
// la suscripción la da el servicio de notificaciones del navegador.

import { CLAVE_PUBLICA_VAPID, deBase64url, esHora } from '../lib/recordatorios'
import { supabase } from '../lib/supabase'
import { ErrorDeValidacion } from '../lib/validacion'

// Fallos de red o del servidor: mensaje claro, sin detalles internos
const SIN_GUARDAR = 'No se han podido guardar los recordatorios. Comprueba la conexión e inténtalo otra vez.'

export type EstadoRecordatorios =
  | { tipo: 'sin-configurar' } // falta la clave pública (scripts/claves-recordatorios.mjs)
  | { tipo: 'no-soportado' } // navegador sin Web Push (p. ej. iPhone sin instalar la app)
  | { tipo: 'bloqueado' } // el usuario denegó el permiso
  | { tipo: 'desactivado' }
  | { tipo: 'activado'; hora: number }

function soportado(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

async function registro(): Promise<ServiceWorkerRegistration> {
  // El service worker solo existe en la app compilada (npm run build / Netlify)
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((ok) => setTimeout(() => ok(null), 5000)),
  ])
  if (!reg) throw new ErrorDeValidacion('El service worker de la app no está activo. Recarga la página.')
  return reg
}

async function suscripcionActual(): Promise<PushSubscription | null> {
  return (await registro()).pushManager.getSubscription()
}

export async function estadoRecordatorios(): Promise<EstadoRecordatorios> {
  if (!CLAVE_PUBLICA_VAPID) return { tipo: 'sin-configurar' }
  if (!soportado()) return { tipo: 'no-soportado' }
  if (Notification.permission === 'denied') return { tipo: 'bloqueado' }
  const sub = await suscripcionActual()
  if (!sub || Notification.permission !== 'granted') return { tipo: 'desactivado' }
  const { data, error } = await supabase.from('suscripciones_push').select('hora').eq('endpoint', sub.endpoint).maybeSingle()
  if (error) throw error
  return data && esHora(data.hora) ? { tipo: 'activado', hora: data.hora } : { tipo: 'desactivado' }
}

function claves(sub: PushSubscription): { p256dh: string; auth: string } {
  const json = sub.toJSON()
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!p256dh || !auth) throw new ErrorDeValidacion('El navegador no ha dado las claves de la suscripción.')
  return { p256dh, auth }
}

/** Pide permiso, suscribe este navegador y guarda la hora. Necesita conexión. */
export async function activarRecordatorios(hora: number): Promise<void> {
  if (!esHora(hora)) throw new ErrorDeValidacion('Hora no válida.')
  if (!navigator.onLine) throw new ErrorDeValidacion('Necesitas conexión para activar los recordatorios.')
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') throw new ErrorDeValidacion('Sin permiso para enviar notificaciones. Puedes darlo en los ajustes del navegador.')
  const reg = await registro()
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: deBase64url(CLAVE_PUBLICA_VAPID) }))
  const { error } = await supabase
    .from('suscripciones_push')
    .upsert({ endpoint: sub.endpoint, ...claves(sub), hora }, { onConflict: 'user_id,endpoint' })
  if (error) {
    await sub.unsubscribe().catch(() => {})
    throw new ErrorDeValidacion(SIN_GUARDAR)
  }
}

export async function cambiarHora(hora: number): Promise<void> {
  if (!esHora(hora)) throw new ErrorDeValidacion('Hora no válida.')
  const sub = await suscripcionActual()
  if (!sub) throw new ErrorDeValidacion('Los recordatorios no están activados en este dispositivo.')
  const { error } = await supabase.from('suscripciones_push').update({ hora }).eq('endpoint', sub.endpoint)
  if (error) throw new ErrorDeValidacion(SIN_GUARDAR)
}

export async function desactivarRecordatorios(): Promise<void> {
  const sub = await suscripcionActual()
  if (!sub) return
  const { error } = await supabase.from('suscripciones_push').delete().eq('endpoint', sub.endpoint)
  if (error) throw new ErrorDeValidacion(SIN_GUARDAR)
  await sub.unsubscribe()
}

/**
 * Al cerrar sesión: este navegador deja de recibir los avisos de esta cuenta
 * (el siguiente que entre no los verá). Sin red y sin esperar: el servidor
 * borrará la fila cuando el servicio de notificaciones le diga que ya no existe.
 */
export async function olvidarEsteDispositivo(): Promise<void> {
  if (!soportado()) return
  const olvidar = async () => {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    await sub?.unsubscribe()
  }
  // Como mucho 2 s: cerrar sesión no puede quedarse esperando a esto
  await Promise.race([olvidar().catch(() => {}), new Promise<void>((ok) => setTimeout(ok, 2000))])
}
