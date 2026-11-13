// Exámenes y módulos de la web de exámenes. Mi Panel solo los LEE (son
// tablas de solo lectura en sync/tablas.ts): se apuntan y se corrigen allí.

import type { FilaLocal } from '../sync/tablas'
import { listar } from './base'

export type Evaluacion = FilaLocal<'evaluaciones'>
export type Modulo = FilaLocal<'modulos'>

export interface DatosExamenes {
  evaluaciones: Evaluacion[]
  modulos: Modulo[]
}

export async function listarExamenes(): Promise<DatosExamenes> {
  const [evaluaciones, modulos] = await Promise.all([listar('evaluaciones'), listar('modulos')])
  return { evaluaciones, modulos }
}
