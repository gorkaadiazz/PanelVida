import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { sesionGuardada } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { detenerSync, iniciarSync } from '../sync/sesion'
import { ContextoSesion, type EstadoSesion } from './useSesion'

export function AuthProvider({ children }: { children: ReactNode }) {
  // Se arranca con la sesión guardada en el dispositivo, sin esperar a la
  // red: sin conexión, supabase-js puede tardar medio minuto en rendirse al
  // intentar renovar un token caducado, y la app tiene que abrirse al momento
  // con los datos locales.
  // La copia local de ese usuario se prepara aquí mismo (y no en un efecto)
  // para que esté lista antes de que las pantallas hagan su primera lectura;
  // iniciarSync no hace nada si se repite con el mismo usuario.
  const [sesion, setSesion] = useState<Session | null>(() => {
    const guardada = sesionGuardada()
    if (guardada) iniciarSync(guardada.user.id)
    return guardada
  })
  const [cargando, setCargando] = useState(() => sesion === null)

  useEffect(() => {
    let activo = true

    // Con sesión: se prepara la copia local de ESE usuario antes de pintar
    // (iniciarSync no llama a Supabase de forma síncrona, así que se puede
    // usar dentro de onAuthStateChange). Sin sesión: no debe quedar ninguna
    // copia local en el dispositivo.
    function aplicar(nueva: Session | null) {
      if (!activo) return
      if (nueva) iniciarSync(nueva.user.id)
      else void detenerSync()
      setSesion(nueva)
      setCargando(false)
    }

    // Si supabase-js dice "sin sesión" pero la sesión sigue guardada, es que
    // no ha podido renovar el token (sin conexión): la sesión sigue valiendo
    // para trabajar con la copia local. Cuando de verdad deja de valer,
    // supabase-js la borra del dispositivo y avisa con SIGNED_OUT.
    const conRespaldo = (s: Session | null) => s ?? sesionGuardada()

    // getSession() espera a que supabase-js termine de arrancar (incluido el
    // canje del ?code= al volver de Google), así que no hay parpadeo de Login.
    supabase.auth
      .getSession()
      .then(({ data }) => aplicar(conRespaldo(data.session)))
      .catch(() => aplicar(conRespaldo(null)))

    // Dentro de este callback no se llama a supabase (puede bloquearse).
    const { data } = supabase.auth.onAuthStateChange((evento, nuevaSesion) => {
      aplicar(evento === 'SIGNED_OUT' ? null : conRespaldo(nuevaSesion))
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
