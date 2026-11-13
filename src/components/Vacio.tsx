import type { ReactNode } from 'react'

/** Estado vacío (.empty): icono, qué falta y qué hacer. */
export function Vacio({ icono, titulo, children }: { icono: ReactNode; titulo: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icono}
      <p className="empty__title">{titulo}</p>
      {children && <p>{children}</p>}
    </div>
  )
}
