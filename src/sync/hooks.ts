// Hooks de React sobre la copia local:
//  · useConsulta: lee datos y vuelve a leerlos cuando cambian (por un cambio
//    hecho aquí, en otra pestaña o llegado del servidor).
//  · useEstadoSync: estado de la sincronización, para el indicador.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { estadoSync, suscribirDatos, suscribirEstado, versionDe, ESTADO_INICIAL, type EstadoSync } from './avisos'
import type { NombreTabla } from './tablas'

export interface Consulta<T> {
  /** undefined hasta la primera lectura. Al releer se mantiene el dato anterior (no parpadea). */
  datos: T | undefined
  /** true solo mientras no ha terminado la primera lectura. */
  cargando: boolean
  /** Error de la última lectura (p. ej. IndexedDB no disponible); null si fue bien. */
  error: Error | null
}

/**
 * Lee de la copia local con `leer` y repite la lectura cuando cambia alguna
 * de las `tablas` o cambia `depende` (el valor del que dependa la lectura:
 * una fecha, un id… Si son varios, únelos en un texto).
 *
 *   const { datos: tareas } = useConsulta(['tareas'], listarTareas)
 *   const marcas = useConsulta(['habito_marcas'], () => listarMarcas(desde), desde)
 */
export function useConsulta<T>(
  tablas: readonly NombreTabla[],
  leer: () => Promise<T>,
  depende: string | number | boolean | null | undefined = null,
): Consulta<T> {
  const clave = tablas.join(',')
  const version = useSyncExternalStore(
    suscribirDatos,
    () => versionDe(clave ? clave.split(',') : []),
    () => 0,
  )
  const [consulta, setConsulta] = useState<Consulta<T>>({ datos: undefined, cargando: true, error: null })

  // Siempre la última función `leer` sin obligar a quien llama a memorizarla
  const leerActual = useRef(leer)
  useEffect(() => {
    leerActual.current = leer
  })

  useEffect(() => {
    let vigente = true
    leerActual.current().then(
      (datos) => {
        if (vigente) setConsulta({ datos, cargando: false, error: null })
      },
      (e: unknown) => {
        if (vigente) setConsulta((previa) => ({ datos: previa.datos, cargando: false, error: e instanceof Error ? e : new Error(String(e)) }))
      },
    )
    return () => {
      vigente = false
    }
  }, [version, clave, depende])

  return consulta
}

/** Estado de la sincronización: pendientes, sincronizando, error… (ver EstadoSync). */
export function useEstadoSync(): EstadoSync {
  return useSyncExternalStore(suscribirEstado, estadoSync, () => ESTADO_INICIAL)
}
