// Revisiones de ahorro (semanal y mensual). Las calcula la app sola al día
// siguiente de terminar el periodo (components/ApuntarFijos) y se guardan
// como una foto. Funciona sin conexión.

import type { Json } from '../lib/database.types'
import type { FechaDia } from '../lib/fechas'
import { calcularRevision, hayMovimientos, idRevision, periodoTerminado, TIPOS_REVISION } from '../lib/revision'
import type { FilaLocal } from '../sync/tablas'
import { ErrorNoEncontrado, listar, transaccion } from './base'

export type Revision = FilaLocal<'revisiones'>

/** Todas las revisiones, la más reciente primero. */
export async function listarRevisiones(): Promise<Revision[]> {
  return (await listar('revisiones')).sort((a, b) => b.fin.localeCompare(a.fin) || (a.tipo === 'mensual' ? -1 : 1))
}

/** ¿Falta por hacer la revisión de la semana o el mes que acaba de terminar? */
export function faltaRevision(
  revisiones: readonly Pick<Revision, 'tipo' | 'inicio'>[],
  movimientos: readonly { fecha: FechaDia }[],
  hoy: FechaDia,
): boolean {
  return TIPOS_REVISION.some((tipo) => {
    const p = periodoTerminado(tipo, hoy)
    return hayMovimientos(movimientos, p) && !revisiones.some((r) => r.tipo === tipo && r.inicio === p.inicio)
  })
}

/**
 * Crea la revisión de la semana pasada y la del mes pasado si faltan y hubo
 * movimientos. Solo la última de cada tipo (no recupera las de cuando la app
 * no se abrió). Necesita el perfil (su id es el del usuario, para el id de la
 * revisión): sin él no hace nada. Devuelve cuántas ha creado.
 */
export async function generarRevisiones(hoy: FechaDia): Promise<number> {
  return transaccion(async (e) => {
    const [perfil] = await e.todos('perfiles')
    if (!perfil) return 0
    const [movimientos, fijos, deseos, existentes] = await Promise.all([e.todos('movimientos'), e.todos('movimientos_fijos'), e.todos('deseos'), e.todos('revisiones')])
    let creadas = 0
    for (const tipo of TIPOS_REVISION) {
      const periodo = periodoTerminado(tipo, hoy)
      if (!hayMovimientos(movimientos, periodo)) continue
      const id = idRevision(perfil.id, tipo, periodo.inicio)
      if (existentes.some((r) => r.id === id || (r.tipo === tipo && r.inicio === periodo.inicio))) continue
      const datos = calcularRevision({ periodo, movimientos, fijos, deseos, meta: perfil.meta_ahorro_centimos ?? null, hoy })
      e.crear('revisiones', { tipo, inicio: periodo.inicio, fin: periodo.fin, datos: datos as unknown as Json, vista: false }, id)
      creadas++
    }
    return creadas
  })
}

/** Marca una revisión como vista (deja de salir como «nueva» en Inicio). */
export async function marcarVista(id: string): Promise<void> {
  await transaccion(async (e) => {
    const r = await e.obtener('revisiones', id)
    if (!r) throw new ErrorNoEncontrado('Esa revisión ya no existe.')
    if (!r.vista) e.actualizar('revisiones', r, { vista: true })
  })
}
