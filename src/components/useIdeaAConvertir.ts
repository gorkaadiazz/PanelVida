import { useSearchParams } from 'react-router-dom'
import { useIdeas } from '../repos/hooks'
import type { Idea } from '../repos/ideas'

/**
 * La idea que se está convirtiendo (llega como ?idea=<id> desde la bandeja),
 * o null. `terminar` quita el parámetro de la dirección (al crear o cancelar).
 */
export function useIdeaAConvertir(): { idea: Idea | null; terminar: () => void } {
  const [params, setParams] = useSearchParams()
  const ideas = useIdeas()
  const id = params.get('idea')
  const idea = (id && ideas.datos?.find((i) => i.id === id)) || null
  const terminar = () =>
    setParams(
      (p) => {
        p.delete('idea')
        return p
      },
      { replace: true },
    )
  return { idea, terminar }
}
