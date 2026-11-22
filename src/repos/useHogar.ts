import { useEffect, useState, useSyncExternalStore } from 'react'
import { suscribirDatos, versionDe } from '../sync/avisos'
import { CAMBIO_HOGAR, consultarHogar, hogarGuardado, type Hogar } from './hogar'

export interface EstadoHogar {
  /** undefined: aún no se sabe; null: no estás en ningún hogar. */
  hogar: Hogar | null | undefined
  /** Vuelve a preguntar al servidor. */
  refrescar: () => void
}

/**
 * El hogar en el que estás. Enseña al momento lo guardado en este
 * dispositivo y lo confirma con el servidor al abrir la pantalla y al volver
 * la conexión.
 */
export function useHogar(): EstadoHogar {
  const version = useSyncExternalStore(suscribirDatos, () => versionDe([CAMBIO_HOGAR]), () => 0)
  // El motor avisa cuando cambia el hogar (entras, sales o te expulsan)
  const cambioEnServidor = useSyncExternalStore(suscribirDatos, () => versionDe(['hogar_sincronizado']), () => 0)
  const [hogar, setHogar] = useState<Hogar | null | undefined>(undefined)
  const [pedir, setPedir] = useState(0)

  // Lo guardado (se relee cada vez que cambia)
  useEffect(() => {
    let vivo = true
    hogarGuardado().then(
      (h) => vivo && setHogar(h),
      () => {},
    )
    return () => {
      vivo = false
    }
  }, [version])

  // Preguntar al servidor
  useEffect(() => {
    void consultarHogar().catch((e: unknown) => console.warn('Hogar', e))
    const alVolver = () => setPedir((n) => n + 1)
    window.addEventListener('online', alVolver)
    return () => window.removeEventListener('online', alVolver)
  }, [pedir, cambioEnServidor])

  return { hogar, refrescar: () => setPedir((n) => n + 1) }
}
