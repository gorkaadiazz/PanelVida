// Repositorio de traspasos entre tarjeta y efectivo (sacar del cajero,
// ingresar en el banco). Importes en céntimos. Funciona sin conexión.

import { parsearImporte, validarFechaTraspaso, validarSentido, type Sentido } from '../lib/dinero'
import type { FilaLocal } from '../sync/tablas'
import { listar, transaccion } from './base'

export type Traspaso = FilaLocal<'traspasos'>

export interface DatosTraspaso {
  sentido: Sentido | string
  /** Tal como lo escribe el usuario ("50" o "12,50"). */
  importe: string
  fecha: string
}

function validar(datos: DatosTraspaso) {
  return {
    sentido: validarSentido(datos.sentido),
    importe_centimos: parsearImporte(datos.importe),
    fecha: validarFechaTraspaso(datos.fecha),
  }
}

export function listarTraspasos(): Promise<Traspaso[]> {
  return listar('traspasos')
}

/** Lanza ErrorDeValidacion si algún dato no vale. */
export async function crearTraspaso(datos: DatosTraspaso): Promise<Traspaso> {
  const limpios = validar(datos)
  return transaccion((e) => e.crear('traspasos', limpios))
}

export async function borrarTraspaso(id: string): Promise<void> {
  return transaccion((e) => e.borrar('traspasos', id))
}
