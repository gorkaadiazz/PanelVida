// Qué se le recuerda a un usuario y con qué texto. Lógica pura (sin red ni
// base de datos), compartida por la Edge Function `recordatorios` y sus tests.
//
// El texto solo lleva RECUENTOS, nunca nombres de hábitos, tareas o
// exámenes: aunque el mensaje va cifrado, en la pantalla bloqueada del móvil
// lo puede leer cualquiera.

const ZONA = 'Europe/Madrid'
const TIPOS_EXAMEN = new Set(['examen_teorico', 'examen_practico', 'recuperacion'])

const partes = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
})

/** Día (AAAA-MM-DD) y hora (0-23) en Madrid de un instante. */
export function enMadrid(instante: Date | number | string): { dia: string; hora: number } {
  const valores: Record<string, string> = {}
  for (const p of partes.formatToParts(new Date(instante))) valores[p.type] = p.value
  return { dia: `${valores.year}-${valores.month}-${valores.day}`, hora: Number(valores.hour) }
}

export function diaSiguiente(dia: string): string {
  const d = new Date(`${dia}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export interface DatosUsuario {
  habitos: { id: string; archivado: boolean }[]
  marcas: { habito_id: string; fecha: string; hecho: boolean }[]
  tareas: { hecha: boolean; fecha_limite: string | null }[]
  evaluaciones: { tipo: string; estado: string; fecha: string }[]
}

export interface Pendientes {
  habitos: number
  tareasAtrasadas: number
  tareasHoy: number
  tareasManana: number
  examenesManana: number
}

export function contarPendientes(datos: DatosUsuario, hoy: string): Pendientes {
  const manana = diaSiguiente(hoy)
  const hechosHoy = new Set(datos.marcas.filter((m) => m.hecho && m.fecha === hoy).map((m) => m.habito_id))
  const pendientes = datos.tareas.filter((t) => !t.hecha && t.fecha_limite)
  return {
    habitos: datos.habitos.filter((h) => !h.archivado && !hechosHoy.has(h.id)).length,
    tareasAtrasadas: pendientes.filter((t) => t.fecha_limite! < hoy).length,
    tareasHoy: pendientes.filter((t) => t.fecha_limite === hoy).length,
    tareasManana: pendientes.filter((t) => t.fecha_limite === manana).length,
    examenesManana: datos.evaluaciones.filter((e) => {
      if (!TIPOS_EXAMEN.has(e.tipo) || e.estado !== 'pendiente') return false
      const ms = Date.parse(e.fecha)
      return !Number.isNaN(ms) && enMadrid(ms).dia === manana
    }).length,
  }
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** Mensaje del recordatorio, o null si no hay nada que recordar. */
export function textoRecordatorio(p: Pendientes): { titulo: string; cuerpo: string } | null {
  const lineas: string[] = []
  if (p.examenesManana) lineas.push(p.examenesManana === 1 ? 'Mañana tienes un examen.' : `Mañana tienes ${p.examenesManana} exámenes.`)
  if (p.habitos) lineas.push(`Te ${p.habitos === 1 ? 'queda' : 'quedan'} ${plural(p.habitos, 'hábito', 'hábitos')} por marcar hoy.`)
  const tareas: string[] = []
  if (p.tareasAtrasadas) tareas.push(`${plural(p.tareasAtrasadas, 'atrasada', 'atrasadas')}`)
  if (p.tareasHoy) tareas.push(`${p.tareasHoy} para hoy`)
  if (p.tareasManana) tareas.push(`${p.tareasManana} para mañana`)
  if (tareas.length) lineas.push(`Tareas: ${tareas.join(', ')}.`)
  if (!lineas.length) return null
  return { titulo: p.examenesManana ? 'Mañana hay examen' : 'Mi Panel', cuerpo: lineas.join(' ') }
}
