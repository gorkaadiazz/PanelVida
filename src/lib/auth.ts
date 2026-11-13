// Inicio y cierre de sesión con Google (Supabase Auth). Sin React: las
// pantallas y el AuthProvider usan estas funciones.

import type { Session } from '@supabase/supabase-js'
import { borrarSesionGuardada, leerSesionGuardada } from './sesionGuardada'
import { CLAVE_SESION, supabase } from './supabase'

const MENSAJE_SIN_ACCESO = 'Este email no tiene acceso a la app. Pide que lo añadan a la lista.'
const MENSAJE_GENERICO = 'No se ha podido iniciar sesión. Inténtalo de nuevo.'

// El trigger `comprobar_email_permitido` (tabla emails_permitidos) lanza
// "Este email no tiene acceso a la app"; Supabase Auth lo suele envolver como
// "Database error saving new user".
const ES_EMAIL_NO_PERMITIDO = /database error saving new user|no tiene acceso/i

/**
 * Lleva al usuario a la pantalla de Google (pasando por Supabase) y vuelve a
 * la raíz de la app. Si no se puede ni empezar, lanza el error de Supabase
 * (tradúcelo con mensajeDeErrorAuth).
 */
export async function entrarConGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${location.origin}/`,
      queryParams: { prompt: 'select_account' }, // deja elegir cuenta siempre
    },
  })
  if (error) throw error
}

/** Lo que se espera como mucho a que el servidor confirme el cierre. */
export const ESPERA_CIERRE_MS = 3000

/**
 * Cierra la sesión SOLO en este dispositivo. NUNCA lanza, no depende de la
 * red y termina en unos segundos como mucho: en un PC compartido (el de
 * clase) la sesión no puede quedarse abierta porque falle la wifi.
 *
 *  1. Se borra a mano la sesión guardada (localStorage) ANTES de nada. Si se
 *     dejara a signOut(), con el token caducado y sin red supabase-js intenta
 *     renovarlo primero y tarda hasta 30 s en borrarla: si en ese rato se
 *     cierra la pestaña, el siguiente alumno entraría con tu cuenta.
 *  2. signOut({ scope: 'local' }) ya no encuentra sesión: avisa a la app
 *     (SIGNED_OUT) sin tocar la red.
 *  3. Si hay red, se intenta anular el token en el servidor (como mucho
 *     ESPERA_CIERRE_MS). Si falla, no pasa nada: en el dispositivo ya no está.
 *  4. Si aun así quedara sesión guardada, se recarga la app limpia.
 *
 * Borrar la copia local de datos (IndexedDB) es cosa de sync/sesion.ts
 * (cerrarSesion), que es lo que deben llamar las pantallas.
 */
export async function salir(): Promise<void> {
  const token = sesionGuardada()?.access_token
  borrarSesionGuardada(CLAVE_SESION)

  await conTope(async () => {
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) console.warn('supabase-js no ha confirmado el cierre de sesión (en este dispositivo ya está cerrada).')
    } catch {
      console.warn('No se ha podido avisar del cierre de sesión por la vía normal.')
    }
  })

  if (token && (typeof navigator === 'undefined' || navigator.onLine)) {
    await conTope(async () => {
      try {
        await supabase.auth.admin.signOut(token, 'local')
      } catch {
        // El token caducará solo; en este dispositivo ya no está
      }
    })
  }

  if (sesionGuardada()) {
    borrarSesionGuardada(CLAVE_SESION)
    location.replace('/')
  }
}

/** Espera a `fn`, pero nunca más de ESPERA_CIERRE_MS. No lanza. */
async function conTope(fn: () => Promise<void>): Promise<void> {
  let temporizador: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    fn().catch(() => {}),
    new Promise<void>((ok) => {
      temporizador = setTimeout(ok, ESPERA_CIERRE_MS)
    }),
  ])
  clearTimeout(temporizador)
}

/**
 * La sesión guardada en este dispositivo, sin pasar por la red. Sirve para
 * abrir la app sin conexión cuando supabase-js no puede renovar el token
 * (ver lib/sesionGuardada.ts).
 */
export function sesionGuardada(): Session | null {
  return leerSesionGuardada(CLAVE_SESION)
}

/**
 * Traduce un error de Supabase Auth a un mensaje para el usuario. Nunca
 * devuelve el texto interno del error (podría filtrar detalles del servidor).
 */
export function mensajeDeErrorAuth(error: unknown): string {
  const e = (typeof error === 'object' && error !== null ? error : {}) as { message?: unknown; code?: unknown }
  const texto = `${typeof e.message === 'string' ? e.message : ''} ${typeof e.code === 'string' ? e.code : ''}`
  if (ES_EMAIL_NO_PERMITIDO.test(texto)) return MENSAJE_SIN_ACCESO
  return MENSAJE_GENERICO
}

/**
 * Al volver de Google con un fallo, Supabase deja `error` y
 * `error_description` en la URL (en la query o en el hash). Esto lo lee,
 * limpia la URL y devuelve el mensaje traducido, o null si no hay error.
 *
 * El texto de la URL lo puede escribir cualquiera en un enlace, así que
 * solo se usa para reconocer el caso del email no autorizado: nunca se
 * muestra tal cual.
 *
 * El ?code= de un login correcto lo recoge y lo quita supabase-js
 * (detectSessionInUrl); aquí no se toca.
 */
export function leerErrorDeVuelta(): string | null {
  const query = new URLSearchParams(location.search)
  const hash = new URLSearchParams(location.hash.replace(/^#\/?/, ''))
  const enQuery = query.has('error') || query.has('error_description')
  const enHash = hash.has('error') || hash.has('error_description')
  if (!enQuery && !enHash) return null

  const descripcion = query.get('error_description') ?? hash.get('error_description') ?? ''

  // Limpia la URL sin recargar: quita los parámetros de error y, si el error
  // venía en el hash, el hash entero (solo trae datos del error).
  for (const clave of ['error', 'error_code', 'error_description']) query.delete(clave)
  const resto = query.toString()
  history.replaceState(history.state, '', location.pathname + (resto ? `?${resto}` : '') + (enHash ? '' : location.hash))

  return ES_EMAIL_NO_PERMITIDO.test(descripcion) ? MENSAJE_SIN_ACCESO : MENSAJE_GENERICO
}
