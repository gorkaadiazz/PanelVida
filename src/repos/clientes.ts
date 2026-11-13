// Repositorio de los clientes del negocio de páginas web. Funciona sin conexión.

import { parsearPrecio } from '../lib/dinero'
import { ordenAlFinal, validarEstado, validarNombreCliente, validarNotas, type EstadoCliente } from '../lib/negocio'
import type { FilaLocal } from '../sync/tablas'
import { ErrorNoEncontrado, listar, transaccion } from './base'

export type Cliente = FilaLocal<'clientes_web'>

export interface DatosCliente {
  nombre: string
  /** Tal como lo escribe el usuario ("350" o "350,00"); '' o "0" = sin precio. */
  precio: string
  notas: string
}

function validar(datos: DatosCliente) {
  return {
    nombre: validarNombreCliente(datos.nombre),
    precio_centimos: parsearPrecio(datos.precio),
    notas: validarNotas(datos.notas),
  }
}

export function listarClientes(): Promise<Cliente[]> {
  return listar('clientes_web')
}

/** Crea un cliente al final del estado indicado (por defecto, Contacto). */
export async function crearCliente(datos: DatosCliente, estado: EstadoCliente = 'contacto'): Promise<Cliente> {
  const limpios = validar(datos)
  const est = validarEstado(estado)
  return transaccion(async (e) => {
    const orden = ordenAlFinal(await e.todos('clientes_web'), est)
    return e.crear('clientes_web', { ...limpios, estado: est, orden })
  })
}

export async function editarCliente(id: string, datos: DatosCliente): Promise<Cliente> {
  const limpios = validar(datos)
  return transaccion(async (e) => {
    const anterior = await e.obtener('clientes_web', id)
    if (!anterior) throw new ErrorNoEncontrado('Ese cliente ya no existe.')
    return e.actualizar('clientes_web', anterior, limpios)
  })
}

/** Pasa el cliente a otro estado (va al final de ese estado). */
export async function moverCliente(id: string, estado: EstadoCliente): Promise<Cliente> {
  const est = validarEstado(estado)
  return transaccion(async (e) => {
    const anterior = await e.obtener('clientes_web', id)
    if (!anterior) throw new ErrorNoEncontrado('Ese cliente ya no existe.')
    if (anterior.estado === est) return anterior
    const orden = ordenAlFinal(await e.todos('clientes_web'), est)
    return e.actualizar('clientes_web', anterior, { estado: est, orden })
  })
}

export async function borrarCliente(id: string): Promise<void> {
  return transaccion((e) => e.borrar('clientes_web', id))
}
