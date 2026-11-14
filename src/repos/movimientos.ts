// Repositorio de ingresos y gastos. Importes en céntimos. Funciona sin conexión.

import { parsearImporte, validarCategoria, validarConcepto, validarFechaMovimiento, validarTipo, type TipoMovimiento } from '../lib/dinero'
import type { FilaLocal } from '../sync/tablas'
import { ErrorNoEncontrado, listar, transaccion } from './base'

export type Movimiento = FilaLocal<'movimientos'>

export interface DatosMovimiento {
  tipo: TipoMovimiento | string
  concepto: string
  /** Tal como lo escribe el usuario ("12,50"). */
  importe: string
  fecha: string
  /** Solo en gastos; '' o sin poner = sin categoría. */
  categoria?: string
}

function validar(datos: DatosMovimiento) {
  const tipo = validarTipo(datos.tipo)
  return {
    tipo,
    concepto: validarConcepto(datos.concepto),
    importe_centimos: parsearImporte(datos.importe),
    fecha: validarFechaMovimiento(datos.fecha),
    categoria: validarCategoria(tipo, datos.categoria),
  }
}

/** Todos los movimientos (sin ordenar: lib/dinero los agrupa y ordena). */
export function listarMovimientos(): Promise<Movimiento[]> {
  return listar('movimientos')
}

/** Lanza ErrorDeValidacion si algún dato no vale. */
export async function crearMovimiento(datos: DatosMovimiento): Promise<Movimiento> {
  const limpios = validar(datos)
  return transaccion((e) => e.crear('movimientos', limpios))
}

export async function editarMovimiento(id: string, datos: DatosMovimiento): Promise<Movimiento> {
  const limpios = validar(datos)
  return transaccion(async (e) => {
    const anterior = await e.obtener('movimientos', id)
    if (!anterior) throw new ErrorNoEncontrado('Ese movimiento ya no existe.')
    return e.actualizar('movimientos', anterior, limpios)
  })
}

export async function borrarMovimiento(id: string): Promise<void> {
  return transaccion((e) => e.borrar('movimientos', id))
}
