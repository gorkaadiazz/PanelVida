import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { limpiarDatosLocales } from '../lib/limpieza'
import { ContextoSesion, type EstadoSesion } from './useSesion'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [cargando, setCargando] = useState(true)
  const [sesion, setSesion] = useState<Session | null>(null)

  useEffect(() => {
    let activo = true

    // getSession() espera a que supabase-js termine de arrancar (incluido el
    // canje del ?code= al volver de Google), así que no hay parpadeo de Login.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (activo) setSesion(data.session)
      })
      .catch(() => {
        if (activo) setSesion(null)
      })
      .finally(() => {
        if (activo) setCargando(false)
      })

    // Dentro de este callback no se llama a supabase (puede bloquearse).
    const { data } = supabase.auth.onAuthStateChange((evento, nuevaSesion) => {
      if (!activo) return
      setSesion(nuevaSesion)
      setCargando(false)
      if (evento === 'SIGNED_OUT') void limpiarDatosLocales()
    })

    return () => {
      activo = false
      data.subscription.unsubscribe()
    }
  }, [])

  const valor = useMemo<EstadoSesion>(
    () => ({ cargando, sesion, usuario: sesion?.user ?? null }),
    [cargando, sesion],
  )

  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>
}
