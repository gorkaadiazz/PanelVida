import type { FechaDia } from '../lib/fechas'
import { textoFechaLimite, urgencia } from '../lib/tareas'
import type { Tarea } from '../repos/tareas'

/** Fecha límite de una tarea: roja si va atrasada, ámbar si vence hoy o mañana. */
export function EtiquetaFecha({ tarea, hoy }: { tarea: Tarea; hoy: FechaDia }) {
  const texto = textoFechaLimite(tarea.fecha_limite, hoy)
  if (!texto) return null
  const u = urgencia(tarea, hoy)
  if (u === 'atrasada') return <span className="tag tag--danger">Atrasada · {texto}</span>
  if (u === 'proxima') return <span className="tag tag--warn">{texto}</span>
  return (
    <span className="tag">
      <span className="visually-hidden">Fecha límite: </span>
      <span className="num">{texto}</span>
    </span>
  )
}
