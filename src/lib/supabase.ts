// Cliente de Supabase de la app (uno solo para todo el proyecto).
//
// Solo usa claves PÚBLICAS: la URL del proyecto y la anon/publishable key.
// Lo que protege los datos son las políticas RLS de la base de datos.

import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { claveDeSesion } from './sesionGuardada'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. ' +
      'Copia .env.example como .env.local, rellena los valores de tu proyecto de Supabase ' +
      'y vuelve a arrancar "npm run dev".',
  )
}

/**
 * Clave de localStorage donde supabase-js guarda la sesión. Es la misma que
 * usaría por defecto; se fija aquí para poder leerla y borrarla a mano
 * (lib/sesionGuardada.ts).
 */
export const CLAVE_SESION = claveDeSesion(url)

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    storageKey: CLAVE_SESION,
    flowType: 'pkce', // flujo seguro de OAuth para apps que corren en el navegador
    persistSession: true, // la sesión se recuerda al cerrar la app
    autoRefreshToken: true, // y se renueva sola antes de caducar
    detectSessionInUrl: true, // recoge el ?code= al volver de Google (y lo quita de la URL)
  },
})
