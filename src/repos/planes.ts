// Repositorio de planes pendientes. Funciona sin conexión, como todos.

import type { FechaDia } from '../lib/fechas'
import { esEstadoPlan, estadoTrasGuardar, validarComentario, validarPlan, validarValoracion, type DatosPlanTexto } from '../lib/planes'
import type { FilaLocal } from '../sync/tablas'
import { ErrorNoEncontrado, listar, transaccion, type Escritor } from './base'
import { quitarIdea } from './ideas'

export type Plan = FilaLocal<'planes'>
export type { DatosPlanTexto }

export function listarPlanes(): Promise<Plan[]> {
  return listar('planes')
}

async function obtenerPlan(e: Escritor, id: string): Promise<Plan> {
  const plan = await e.obtener('planes', id)
  if (!plan) throw new ErrorNoEncontrado('Ese plan ya no existe.')
  return plan
}

/**
 * Crea un plan: con fecha nace «planeado»; sin fecha, «idea». Con
 * `desdeIdea`, en la misma operación se borra esa idea de la bandeja.
 */
export async function crearPlan(datos: DatosPlanTexto, desdeIdea?: string): Promise<Plan> {
  const limpios = validarPlan(datos)
  return transaccion(async (e) => {
    const plan = e.crear('planes', { ...limpios, estado: estadoTrasGuardar('idea', limpios.fecha), valoracion: null, comentario: '' })
    if (desdeIdea) await quitarIdea(e, desdeIdea)
    return plan
  })
}

/** Ponerle fecha a una idea la pasa a «planeado»; quitársela, la devuelve a «idea». */
export async function editarPlan(id: string, datos: DatosPlanTexto): Promise<Plan> {
  const limpios = validarPlan(datos)
  return transaccion(async (e) => {
    const anterior = await obtenerPlan(e, id)
    const estado = estadoTrasGuardar(esEstadoPlan(anterior.estado) ? anterior.estado : 'idea', limpios.fecha)
    return e.actualizar('planes', anterior, { ...limpios, estado })
  })
}

/** Marca el plan como hecho, con valoración (1-5) y comentario opcionales. Sin fecha, se le pone la de hoy. */
export async function marcarHecho(id: string, valoracion: string | number | null, comentario: string, hoy: FechaDia): Promise<Plan> {
  const v = validarValoracion(valoracion)
  const c = validarComentario(comentario)
  return transaccion(async (e) => {
    const anterior = await obtenerPlan(e, id)
    return e.actualizar('planes', anterior, { estado: 'hecho', valoracion: v, comentario: c, fecha: anterior.fecha ?? hoy })
  })
}

/** Deshace «hecho»: vuelve a planeado (o a idea si no tenía fecha) y quita la valoración. */
export async function deshacerHecho(id: string): Promise<Plan> {
  return transaccion(async (e) => {
    const anterior = await obtenerPlan(e, id)
    return e.actualizar('planes', anterior, { estado: anterior.fecha ? 'planeado' : 'idea', valoracion: null, comentario: '' })
  })
}

export async function borrarPlan(id: string): Promise<void> {
  return transaccion((e) => e.borrar('planes', id))
}
