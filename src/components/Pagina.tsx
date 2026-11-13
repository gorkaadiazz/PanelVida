import type { ReactNode } from 'react'
import { useTitulo } from './useTitulo'

interface Props {
  /** Título de la pestaña ("Hábitos" → "Hábitos · Mi Panel"). */
  titulo: string
  /** Texto del h1 si es distinto del título (p. ej. el saludo de Inicio). */
  encabezado?: ReactNode
  /** Línea bajo el h1 (p. ej. la fecha de hoy). */
  subtitulo?: ReactNode
  /** Acción a la derecha de la cabecera. */
  accion?: ReactNode
  children: ReactNode
}

/**
 * Esqueleto común de cada pantalla: título de pestaña y cabecera con el h1.
 * El h1 lleva tabIndex -1 para que Layout le pase el foco al cambiar de ruta.
 */
export function Pagina({ titulo, encabezado, subtitulo, accion, children }: Props) {
  useTitulo(titulo)
  return (
    <>
      <header className="app-header">
        <div>
          <h1 className="t-screen" tabIndex={-1}>
            {encabezado ?? titulo}
          </h1>
          {subtitulo && <p className="muted">{subtitulo}</p>}
        </div>
        {accion}
      </header>
      {children}
    </>
  )
}
