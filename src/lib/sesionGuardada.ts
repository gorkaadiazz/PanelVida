// La sesión que supabase-js guarda en localStorage, leída a mano.
//
// Hace falta para dos cosas que supabase-js no cubre:
//  1. Abrir la app SIN CONEXIÓN: si el token de acceso ha caducado (dura 1 h)
//     y no hay red para renovarlo, getSession() responde "sin sesión" aunque
//     la sesión siga guardada. La app usa entonces esta copia para saber
//     quién es el usuario y enseñarle sus datos locales; en cuanto vuelve la
//     red, supabase-js renueva el token solo.
//  2. Cerrar sesión pase lo que pase: si signOut() no llegara a borrar la
//     sesión, se borra aquí.
//
// Sin React ni Supabase: recibe la clave y el almacén (así se puede probar).

import type { Session } from '@supabase/supabase-js'

type Almacen = Pick<Storage, 'getItem' | 'removeItem'>

/** Clave que usa supabase-js por defecto: sb-<ref del proyecto>-auth-token. */
export function claveDeSesion(urlSupabase: string): string {
  return `sb-${new URL(urlSupabase).hostname.split('.')[0]}-auth-token`
}

function almacenPorDefecto(): Almacen | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null // localStorage bloqueado por el navegador
  }
}

const esTexto = (v: unknown): v is string => typeof v === 'string' && v.length > 0

/**
 * Sesión guardada, o null si no hay o no tiene la forma esperada. No
 * comprueba que el token siga siendo válido: solo sirve para saber de quién
 * es la copia local. Quien valida de verdad es el servidor en cada petición.
 */
export function leerSesionGuardada(clave: string, almacen: Almacen | null = almacenPorDefecto()): Session | null {
  if (!almacen) return null
  try {
    const texto = almacen.getItem(clave)
    if (!texto) return null
    const dato: unknown = JSON.parse(texto)
    if (typeof dato !== 'object' || dato === null) return null
    const s = dato as { access_token?: unknown; refresh_token?: unknown; user?: { id?: unknown } | null }
    if (!esTexto(s.access_token) || !esTexto(s.refresh_token) || !esTexto(s.user?.id)) return null
    return dato as Session
  } catch {
    return null
  }
}

/** Borra la sesión guardada y sus claves auxiliares. No lanza. */
export function borrarSesionGuardada(clave: string, almacen: Almacen | null = almacenPorDefecto()): void {
  if (!almacen) return
  for (const k of [clave, `${clave}-user`, `${clave}-code-verifier`]) {
    try {
      almacen.removeItem(k)
    } catch {
      // Se sigue con las demás
    }
  }
}
