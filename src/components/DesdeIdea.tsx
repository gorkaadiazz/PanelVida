import type { Idea } from '../repos/ideas'

/** Aviso encima del formulario: «Convirtiendo la idea …» con su botón Cancelar. */
export function AvisoDesdeIdea({ idea, que, cancelar }: { idea: Idea; que: string; cancelar: () => void }) {
  return (
    <div className="alert alert--info desde-idea" role="status">
      <div className="alert__body">
        <p className="alert__title">Convirtiendo una idea en {que}</p>
        <p className="break">«{idea.texto}»</p>
        <p className="t-small muted">Completa el resto y guarda: la idea saldrá de la bandeja.</p>
      </div>
      <button type="button" className="btn btn--ghost" onClick={cancelar}>
        Cancelar
      </button>
    </div>
  )
}
