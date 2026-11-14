import { useEffect } from 'react'
import { apuntesPendientes } from '../lib/fijos'
import { aplicarFijos } from '../repos/fijos'
import { useFijos, useMovimientos, usePerfil, useRevisiones } from '../repos/hooks'
import { faltaRevision, generarRevisiones } from '../repos/revisiones'
import { useEstadoSync } from '../sync/hooks'
import { useHoy } from './useHoy'

/**
 * Sin interfaz: apunta los movimientos fijos cuando les llega el día y, después,
 * crea la revisión de ahorro de la semana o el mes que acaba de terminar (al
 * abrir la app, al pasar la medianoche o al bajar datos de otro dispositivo).
 *
 * Espera a la primera sincronización de esta sesión: así parte de lo último
 * que se apuntó en los otros dispositivos (`ultimo_apunte`) y no vuelve a
 * apuntar algo que el usuario ya borró, ni rehace una revisión que ya está.
 * Sin conexión no espera para los fijos: apunta con lo que hay (el id de cada
 * apunte es el mismo en todos los dispositivos, así que no se duplica). Las
 * revisiones sí esperan a tener conexión y estar sincronizado: su id es
 * aleatorio y así no la hacen dos dispositivos a la vez (no corre prisa).
 */
export function ApuntarFijos() {
  const dia = useHoy()
  const fijos = useFijos()
  const movimientos = useMovimientos()
  const revisiones = useRevisiones()
  const perfil = usePerfil()
  const { ultimaSincronizacion, fase, primeraDescargaHecha } = useEstadoSync()
  const listo = ultimaSincronizacion !== null || (fase === 'sin-conexion' && primeraDescargaHecha)

  useEffect(() => {
    if (!listo) return
    const hayFijos = fijos.datos?.some((f) => apuntesPendientes(f, dia).length > 0) ?? false
    const conectado = ultimaSincronizacion !== null && fase !== 'sin-conexion'
    const hayRevision = conectado && !!perfil.datos && !!revisiones.datos && !!movimientos.datos && faltaRevision(revisiones.datos, movimientos.datos, dia)
    if (!hayFijos && !hayRevision) return
    void (async () => {
      try {
        if (hayFijos) await aplicarFijos(dia)
        // Después de los fijos, para que la revisión ya cuente lo que tocaba el domingo o el último día
        if (conectado) await generarRevisiones(dia)
      } catch (error: unknown) {
        console.error('No se han podido apuntar los fijos o hacer la revisión', error)
      }
    })()
  }, [listo, dia, fijos.datos, movimientos.datos, revisiones.datos, perfil.datos, ultimaSincronizacion, fase])

  return null
}
