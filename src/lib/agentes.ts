// Agente del PC: lógica pura de la app (sin React ni Supabase).

/** El agente late cada minuto; si no se sabe de él en 2,5 minutos, está apagado. */
export const MARGEN_LATIDO_MS = 150_000

export interface EstadoPC {
  encendido: boolean
  /** «Encendido», «Apagado (visto hace 5 min)», «Aún no se ha conectado». */
  texto: string
}

/** «hace un momento», «hace 5 min», «hace 3 h», «hace 2 días». */
export function textoHace(ms: number): string {
  if (ms < 60_000) return 'hace un momento'
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  return d === 1 ? 'hace 1 día' : `hace ${d} días`
}

export function estadoPC(ultimoLatido: string | null, ahora: number): EstadoPC {
  const t = ultimoLatido ? Date.parse(ultimoLatido) : NaN
  if (Number.isNaN(t)) return { encendido: false, texto: 'Aún no se ha conectado' }
  // Un reloj algo adelantado en el servidor no lo deja «en el futuro»
  const desde = Math.max(0, ahora - t)
  if (desde <= MARGEN_LATIDO_MS) return { encendido: true, texto: 'Encendido' }
  return { encendido: false, texto: `Apagado (visto ${textoHace(desde)})` }
}

/** El código de vincular como se escribe: «ABCD-EFGH». */
export function comandoVincular(codigo: string, nombre: string): string {
  const limpio = nombre.replace(/["\\$`]/g, '').replace(/\s+/g, ' ').trim()
  return limpio ? `mipanel-agente vincular ${codigo} "${limpio}"` : `mipanel-agente vincular ${codigo}`
}

/** Minutos y segundos que le quedan a un código: «9:41». */
export function cuentaAtras(caducaEn: string, ahora: number): string | null {
  const ms = Date.parse(caducaEn) - ahora
  if (Number.isNaN(ms) || ms <= 0) return null
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
