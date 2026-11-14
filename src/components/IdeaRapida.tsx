import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { mensajeDeError } from '../lib/errores'
import { TEXTO_IDEA_MAX } from '../lib/ideas'
import { crearIdea } from '../repos/ideas'
import { IconoMasUno } from './iconos'

/**
 * Botón «+» siempre visible (en el móvil, encima de la barra inferior): abre
 * un campo y guarda la idea en la bandeja con un toque (o Enter), sin elegir
 * nada más. Usa <dialog> nativo: atrapa el foco, Esc lo cierra y al cerrar el
 * foco vuelve al botón.
 */
export function IdeaRapida() {
  const id = useId()
  const dialogo = useRef<HTMLDialogElement>(null)
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardada, setGuardada] = useState(false)

  // El aviso «Idea guardada» desaparece solo
  useEffect(() => {
    if (!guardada) return
    const t = setTimeout(() => setGuardada(false), 6000)
    return () => clearTimeout(t)
  }, [guardada])

  function abrir() {
    setError(null)
    setGuardada(false)
    dialogo.current?.showModal()
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    try {
      await crearIdea(texto)
      setTexto('')
      setError(null)
      dialogo.current?.close()
      setGuardada(true)
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }

  return (
    <>
      <button type="button" className="idea-boton" aria-label="Apuntar una idea" aria-haspopup="dialog" onClick={abrir}>
        <IconoMasUno />
      </button>

      <dialog
        ref={dialogo}
        className="idea-dialogo"
        aria-labelledby={`${id}-titulo`}
        onClose={() => setError(null)}
        // Tocar el fondo oscuro (fuera de la caja) cierra, como en Android; lo escrito se conserva
        onClick={(e) => {
          if (e.target !== e.currentTarget) return
          const caja = e.currentTarget.getBoundingClientRect()
          const fuera = e.clientX < caja.left || e.clientX > caja.right || e.clientY < caja.top || e.clientY > caja.bottom
          if (fuera) e.currentTarget.close()
        }}
      >
        <form className="stack" onSubmit={(e) => void guardar(e)}>
          <h2 id={`${id}-titulo`} className="t-section">
            Apuntar una idea
          </h2>
          <div className="field">
            <label htmlFor={`${id}-texto`} className="visually-hidden">
              Idea
            </label>
            <input
              id={`${id}-texto`}
              className="input"
              value={texto}
              maxLength={TEXTO_IDEA_MAX}
              placeholder="Lo que se te ocurra…"
              autoComplete="off"
              enterKeyHint="done"
              autoFocus
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : `${id}-ayuda`}
              onChange={(e) => setTexto(e.target.value)}
            />
            {error ? (
              <p id={`${id}-error`} className="field__error">
                {error}
              </p>
            ) : (
              <p id={`${id}-ayuda`} className="field__hint">
                Se guarda en la bandeja de ideas; luego decides qué hacer con ella.
              </p>
            )}
          </div>
          <div className="row">
            <button type="submit" className="btn btn--primary">
              Guardar
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => dialogo.current?.close()}>
              Cancelar
            </button>
          </div>
        </form>
      </dialog>

      <p role="status" className={guardada ? 'idea-guardada float' : 'visually-hidden'}>
        {guardada && (
          <>
            Idea guardada ·{' '}
            <Link to="/ideas">Ver la bandeja</Link>
          </>
        )}
      </p>
    </>
  )
}
