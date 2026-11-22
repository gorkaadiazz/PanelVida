// Hooks de datos para las pantallas: leen de la copia local y se refrescan
// solos cuando cambia (aquí, en otra pestaña o al sincronizar).

import type { FechaDia } from '../lib/fechas'
import { useConsulta, type Consulta } from '../sync/hooks'
import { listarClientes, type Cliente } from './clientes'
import { listarCumpleanos, type Cumple } from './cumpleanos'
import { listarDeseos, type Deseo } from './deseos'
import { listarTraspasos, type Traspaso } from './traspasos'
import { listarExamenes, type DatosExamenes } from './examenes'
import { listarFijos, type Fijo } from './fijos'
import { listarIdeas, type Idea } from './ideas'
import { listarMovimientos, type Movimiento } from './movimientos'
import { obtenerPerfil, type Perfil } from './perfil'
import { listarPuente, type ElementoPuente } from './puente'
import { listarPlanes, type Plan } from './planes'
import { listarRevisiones, type Revision } from './revisiones'
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

/** Todos los ingresos y gastos. */
export function useMovimientos(): Consulta<Movimiento[]> {
  return useConsulta(['movimientos'], listarMovimientos)
}

/** Los movimientos fijos de cada mes, por día. */
export function useFijos(): Consulta<Fijo[]> {
  return useConsulta(['movimientos_fijos'], listarFijos)
}

/** Todas las ideas de la bandeja (también las archivadas). */
export function useIdeas(): Consulta<Idea[]> {
  return useConsulta(['ideas'], listarIdeas)
}

/** Todos los cumpleaños (sin ordenar: lib/cumpleanos los ordena por el próximo). */
export function useCumpleanos(): Consulta<Cumple[]> {
  return useConsulta(['cumpleanos'], listarCumpleanos)
}

/** Todos los planes (sin ordenar: lib/planes los filtra y ordena). */
export function usePlanes(): Consulta<Plan[]> {
  return useConsulta(['planes'], listarPlanes)
}

/** La lista de deseos (pendientes y comprados). */
export function useDeseos(): Consulta<Deseo[]> {
  return useConsulta(['deseos'], listarDeseos)
}

/** Todos los traspasos entre tarjeta y efectivo (sin ordenar). */
export function useTraspasos(): Consulta<Traspaso[]> {
  return useConsulta(['traspasos'], listarTraspasos)
}

/** Todos los clientes del negocio. */
export function useClientes(): Consulta<Cliente[]> {
  return useConsulta(['clientes_web'], listarClientes)
}

/** El perfil (para la meta de ahorro); null si aún no se ha descargado. */
export function usePerfil(): Consulta<Perfil | null> {
  return useConsulta(['perfiles'], obtenerPerfil)
}

/** Revisiones de ahorro, la más reciente primero. */
export function useRevisiones(): Consulta<Revision[]> {
  return useConsulta(['revisiones'], listarRevisiones)
}

/** Todo lo del Puente (sin ordenar: lib/puente lo ordena). */
export function usePuente(): Consulta<ElementoPuente[]> {
  return useConsulta(['puente'], listarPuente)
}
