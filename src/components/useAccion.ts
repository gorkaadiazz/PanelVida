import { useCallback, useState } from 'react'
import { mensajeDeError } from '../lib/errores'

/**
 * Ejecuta acciones de la pantalla (crear, marcar, borrar…) y guarda el
 * mensaje del último error para enseñarlo. Devuelve true si la acción fue bien.
 */
export function useAccion() {
  const [error, setError] = useState<string | null>(null)

  const ejecutar = useCallback(async (accion: () => Promise<unknown>): Promise<boolean> => {
    try {
      await accion()
      setError(null)
      return true
    } catch (e) {
      console.error(e)
      setError(mensajeDeError(e))
      return false
    }
  }, [])

  const limpiar = useCallback(() => setError(null), [])

  return { error, ejecutar, limpiar }
}
