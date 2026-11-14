// Bandeja rápida de ideas: lógica pura (sin React ni Supabase).

import { ErrorDeValidacion } from './validacion'

export { ErrorDeValidacion }

export const TEXTO_IDEA_MAX = 500

/** A qué se puede convertir una idea: la pantalla de destino lee ?idea=<id>. */
export const DESTINOS_IDEA: readonly { ruta: string; texto: string }[] = [
  { ruta: '/tareas', texto: 'Tarea' },
  { ruta: '/planes', texto: 'Plan' },
  { ruta: '/deseos', texto: 'Algo que comprar' },
]

export interface IdeaBasica {
  id: string
  texto: string
  archivada: boolean
  created_at: string
}

/** Quita espacios de más (los saltos de línea se respetan). */
export function validarIdea(texto: string): string {
  const limpio = texto
    .split('\n')
    .map((l) => l.trim().replace(/[ \t]+/g, ' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!limpio) throw new ErrorDeValidacion('Escribe la idea.')
  if (limpio.length > TEXTO_IDEA_MAX) throw new ErrorDeValidacion(`La idea no puede tener más de ${TEXTO_IDEA_MAX} caracteres.`)
  return limpio
}

/** Ideas sin procesar (no archivadas), la más reciente primero. */
export function ideasSinProcesar<I extends IdeaBasica>(ideas: readonly I[]): I[] {
  return ideas.filter((i) => !i.archivada).sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))
}

/** Ideas archivadas, la más reciente primero. */
export function ideasArchivadas<I extends IdeaBasica>(ideas: readonly I[]): I[] {
  return ideas.filter((i) => i.archivada).sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))
}

/** Primera línea de una idea, recortada: para rellenar el título de una tarea, plan o deseo. */
export function tituloDeIdea(texto: string, max: number): string {
  const linea = texto.split('\n')[0].trim()
  return linea.length <= max ? linea : `${linea.slice(0, max - 1).trimEnd()}…`
}

/** Resto de la idea (lo que va después de la primera línea), para las notas. */
export function notasDeIdea(texto: string): string {
  return texto.split('\n').slice(1).join('\n').trim()
}
