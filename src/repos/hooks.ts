// Hooks de datos para las pantallas: leen de la copia local y se refrescan
// solos cuando cambia (aquí, en otra pestaña o al sincronizar).

import type { FechaDia } from '../lib/fechas'
import { useConsulta, type Consulta } from '../sync/hooks'
import { listarExamenes, type DatosExamenes } from './examenes'
import { listarHabitos, listarMarcas, type Habito, type Marca } from './habitos'
import { listarTareas, type Tarea } from './tareas'

/** Todos los hábitos (también los archivados), en su orden. */
export function useHabitos(): Consulta<Habito[]> {
  return useConsulta(['habitos'], listarHabitos)
}

/**
 * Marcas de los hábitos. Sin `desde` vienen todas (hacen falta para las
 * rachas); con `desde`, solo las de ese día en adelante.
 */
export function useMarcas(desde?: FechaDia): Consulta<Marca[]> {
  return useConsulta(['habito_marcas'], () => listarMarcas(desde), desde)
}

/** Todas las tareas, ya ordenadas (pendientes por fecha límite y después las hechas). */
export function useTareas(): Consulta<Tarea[]> {
  return useConsulta(['tareas'], listarTareas)
}

/** Exámenes y módulos de la web de exámenes (solo lectura). */
export function useExamenes(): Consulta<DatosExamenes> {
  return useConsulta(['evaluaciones', 'modulos'], listarExamenes)
}
