import { IconoAviso } from './iconos'

/** Error de una acción de la pantalla. La región está siempre montada para que se anuncie. */
export function AvisoError({ mensaje, onCerrar }: { mensaje: string | null; onCerrar?: () => void }) {
  return (
    <div role="alert">
      {mensaje && (
        <div className="alert alert--danger">
          <IconoAviso />
          <div className="alert__body">
            <p>{mensaje}</p>
          </div>
          {onCerrar && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={onCerrar}>
              Cerrar
            </button>
          )}
        </div>
      )}
    </div>
  )
}
