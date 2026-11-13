import type { FechaDia } from '../lib/fechas'
import { textoFechaLimite, urgencia } from '../lib/tareas'
import type { Tarea } from '../repos/tareas'

/**
 * Fecha límite de una tarea: roja si va atrasada, ámbar si vence hoy o mañana.
 * El color nunca va solo: "Atrasada" lo dice el texto. La monoespaciada (.num)
 * solo envuelve la fecha numérica (dd/mm/aaaa), no "Hoy", "Ayer" o "Hace 3 días".
 */
export function EtiquetaFecha({ tarea, hoy }: { tarea: Tarea; hoy: FechaDia }) {
  const texto = textoFechaLimite(tarea.fecha_limite, hoy)
  if (!texto) return null
  const fecha = /^\d/.test(texto) ? <span className="num">{texto}</span> : texto
  const u = urgencia(tarea, hoy)
  if (u === 'atrasada') return <span className="tag tag--danger">Atrasada · {fecha}</span>
  // Próxima es siempre "Hoy" o "Mañana": "Vence hoy", "Vence mañana"
  if (u === 'proxima') return <span className="tag tag--warn">Vence {texto.toLocaleLowerCase('es-ES')}</span>
  return (
    <span className="tag">
      <span className="visually-hidden">Fecha límite: </span>
      {fecha}
    </span>
  )
}
