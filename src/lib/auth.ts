// Inicio y cierre de sesión con Google (Supabase Auth). Sin React: las
// pantallas y el AuthProvider usan estas funciones.

import { supabase } from './supabase'

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

/**
 * Cierra la sesión SOLO en este dispositivo. Borrar la copia local
 * (IndexedDB) es cosa de quien la llame.
 */
export async function salir(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'local' })
  if (error) throw error
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
