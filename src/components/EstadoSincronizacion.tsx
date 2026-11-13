import { describirSync } from '../lib/estadoSync'
import { useEstadoSync } from '../sync/hooks'
import { useEnLinea } from './useEnLinea'

const CLASE = { ok: '', pendiente: ' sync--pendiente', activo: ' sync--activo', error: ' sync--error' } as const

/** Punto de color + texto: "Todo guardado", "2 cambios por subir", "Sin conexión"… */
export function EstadoSincronizacion() {
  const estado = useEstadoSync()
  const enLinea = useEnLinea()
  const { tipo, texto } = describirSync(estado, enLinea)
  return <span className={`sync${CLASE[tipo]}`}>{texto}</span>
}
