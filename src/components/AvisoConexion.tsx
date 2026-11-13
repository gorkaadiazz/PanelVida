import { IconoSinConexion } from './iconos'
import { useEnLinea } from './useEnLinea'

export function AvisoConexion() {
  const enLinea = useEnLinea()
  // La región role="status" está siempre montada para que el lector de
  // pantalla anuncie el cambio; solo se ve cuando no hay conexión.
  return (
    <div role="status">
      {!enLinea && (
        <div className="alert">
          <IconoSinConexion />
          <div className="alert__body">
            <p className="alert__title">Sin conexión</p>
            <p>Puedes seguir usando la app; lo que necesite internet esperará.</p>
          </div>
        </div>
      )}
    </div>
  )
}
