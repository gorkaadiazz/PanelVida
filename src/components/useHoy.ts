import { useEffect, useState } from 'react'
import { hoy, type FechaDia } from '../lib/fechas'

/**
 * El día de hoy en Madrid (AAAA-MM-DD). Se actualiza solo al pasar la
 * medianoche y al volver a la app, para que una pestaña que lleva días
 * abierta no siga enseñando "ayer".
 */
export function useHoy(): FechaDia {
  const [dia, setDia] = useState(() => hoy())

  useEffect(() => {
    const comprobar = () => setDia(hoy()) // si no ha cambiado, React no repinta
    const intervalo = window.setInterval(comprobar, 60_000)
    document.addEventListener('visibilitychange', comprobar)
    window.addEventListener('focus', comprobar)
    return () => {
      window.clearInterval(intervalo)
      document.removeEventListener('visibilitychange', comprobar)
      window.removeEventListener('focus', comprobar)
    }
  }, [])

  return dia
}
