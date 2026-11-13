import { createContext, useContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

export interface EstadoSesion {
  cargando: boolean
  sesion: Session | null
  usuario: User | null
}

export const ContextoSesion = createContext<EstadoSesion | null>(null)

/** Sesión actual. Solo dentro de <AuthProvider>. */
export function useSesion(): EstadoSesion {
  const valor = useContext(ContextoSesion)
  if (!valor) throw new Error('useSesion() se usa fuera de <AuthProvider>')
  return valor
}

/** Nombre a mostrar: el de Google si lo hay; si no, la parte del email antes de la @. */
export function nombreDeUsuario(usuario: User | null): string {
  const meta = usuario?.user_metadata ?? {}
  const nombre = typeof meta.full_name === 'string' ? meta.full_name : typeof meta.name === 'string' ? meta.name : ''
  if (nombre.trim()) return nombre.trim()
  return usuario?.email?.split('@')[0] ?? ''
}
