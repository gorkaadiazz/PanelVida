import { useEffect } from 'react'
import { mesesPendientes } from '../lib/fijos'
import { aplicarFijos } from '../repos/fijos'
import { useFijos } from '../repos/hooks'
import { useEstadoSync } from '../sync/hooks'
import { useHoy } from './useHoy'

/**
 * Sin interfaz: apunta los movimientos fijos cuando les llega el día (al
 * abrir la app, al pasar la medianoche o al bajar fijos de otro dispositivo).
 *
 * Espera a la primera sincronización de esta sesión: así parte de lo último
 * que se apuntó en los otros dispositivos (`ultimo_mes`) y no vuelve a
 * apuntar un mes que el usuario ya borró. Sin conexión no espera: apunta con
 * lo que hay (el id del apunte es el mismo en todos los dispositivos, así que
 * no se duplica).
 */
export function ApuntarFijos() {
  const dia = useHoy()
  const fijos = useFijos()
  const { ultimaSincronizacion, fase, primeraDescargaHecha } = useEstadoSync()
  const listo = ultimaSincronizacion !== null || (fase === 'sin-conexion' && primeraDescargaHecha)

  useEffect(() => {
    if (!listo || !fijos.datos?.some((f) => mesesPendientes(f, dia).length > 0)) return
    aplicarFijos(dia).catch((error: unknown) => console.error('No se han podido apuntar los fijos', error))
  }, [listo, dia, fijos.datos])

  return null
}
