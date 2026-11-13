import { useRegisterSW } from 'virtual:pwa-register/react'
import { IconoActualizar } from './iconos'

export function AvisoActualizacion() {
  const {
    needRefresh: [hayVersionNueva],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error('No se pudo registrar el service worker', error)
    },
  })

  return (
    <div role="status">
      {hayVersionNueva && (
        <div className="alert">
          <IconoActualizar />
          <div className="alert__body row row--between">
            <p className="alert__title">Hay una versión nueva</p>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => void updateServiceWorker(true)}>
              Actualizar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
