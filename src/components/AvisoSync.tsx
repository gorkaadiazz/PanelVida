import { useState } from 'react'
import { avisoRechazados } from '../lib/estadoSync'
import { useEstadoSync } from '../sync/hooks'
import { sincronizarAhora } from '../sync/sesion'
import { IconoAviso } from './iconos'

/**
 * Aviso flotante cuando la sincronización falla o el servidor descarta
 * cambios. Sin conexión no sale: de eso ya avisa AvisoConexion.
 */
export function AvisoSync() {
  const { fase, error, rechazados } = useEstadoSync()
  const [reintentando, setReintentando] = useState(false)
  // Los rechazos ya vistos no vuelven a salir hasta que haya alguno nuevo
  const [rechazosVistos, setRechazosVistos] = useState(0)
  // (si el contador ha vuelto a cero, p. ej. tras cambiar de cuenta, se empieza de nuevo)
  const textoRechazados = avisoRechazados(rechazados >= rechazosVistos ? rechazados - rechazosVistos : rechazados)

  async function reintentar() {
    setReintentando(true)
    try {
      await sincronizarAhora()
    } finally {
      setReintentando(false)
    }
  }

  return (
    <div role="status">
      {fase === 'error' && error && (
        <div className="alert alert--danger">
          <IconoAviso />
          <div className="alert__body">
            <p>{error} Tus cambios siguen guardados en este dispositivo.</p>
          </div>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => void reintentar()}
            disabled={reintentando}
            aria-busy={reintentando || undefined}
          >
            Reintentar
          </button>
        </div>
      )}
      {textoRechazados && (
        <div className="alert alert--warn">
          <IconoAviso />
          <div className="alert__body">
            <p>{textoRechazados}</p>
          </div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setRechazosVistos(rechazados)}>
            Entendido
          </button>
        </div>
      )}
    </div>
  )
}
