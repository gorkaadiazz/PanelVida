// Texto del indicador de sincronización a partir del estado de sync/.
// Puro: recibe el estado y si hay conexión, devuelve qué enseñar.

import type { EstadoSync } from '../sync/avisos'

export type TipoIndicador = 'ok' | 'pendiente' | 'activo' | 'error'

export interface Indicador {
  tipo: TipoIndicador
  texto: string
}

export function cambiosPorSubir(n: number): string {
  return n === 1 ? '1 cambio por subir' : `${n} cambios por subir`
}

export function describirSync(estado: EstadoSync, enLinea: boolean): Indicador {
  if (estado.fase === 'error') return { tipo: 'error', texto: 'Error al sincronizar' }
  if (!enLinea || estado.fase === 'sin-conexion') {
    return estado.pendientes > 0
      ? { tipo: 'pendiente', texto: `Sin conexión · ${cambiosPorSubir(estado.pendientes)}` }
      : { tipo: 'pendiente', texto: 'Sin conexión' }
  }
  if (estado.fase === 'sincronizando') return { tipo: 'activo', texto: 'Sincronizando…' }
  if (estado.pendientes > 0) return { tipo: 'pendiente', texto: cambiosPorSubir(estado.pendientes) }
  if (estado.fase === 'inactivo') return { tipo: 'activo', texto: 'Preparando…' }
  return { tipo: 'ok', texto: 'Todo guardado' }
}

/** Texto del aviso cuando el servidor ha descartado cambios (null si no hay). */
export function avisoRechazados(rechazados: number): string | null {
  if (rechazados <= 0) return null
  return rechazados === 1
    ? 'El servidor no ha aceptado 1 cambio y se ha descartado. Revisa que lo último que hiciste esté bien.'
    : `El servidor no ha aceptado ${rechazados} cambios y se han descartado. Revisa que lo último que hiciste esté bien.`
}
