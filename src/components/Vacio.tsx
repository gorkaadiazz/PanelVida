import type { ReactNode } from 'react'

/** Estado vacío (.empty): icono, qué falta y qué hacer (accion: botón o enlace). */
export function Vacio({
  icono,
  titulo,
  children,
  accion,
}: {
  icono: ReactNode
  titulo: string
  children?: ReactNode
  accion?: ReactNode
}) {
  return (
    <div className="empty">
      {icono}
      <p className="empty__title">{titulo}</p>
      {children && <p>{children}</p>}
      {accion}
    </div>
  )
}
