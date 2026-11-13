// Próximo examen para la tarjeta de Inicio, a partir de los datos de la web
// de exámenes (evaluaciones y módulos, que Mi Panel solo lee). Puro: sin
// React ni Supabase.

import { diaEnMadrid, diferenciaDias, formatearFecha, ZONA, type FechaDia } from './fechas'

/** Tipos de evaluación que cuentan como examen (lo demás son prácticas, trabajos…). */
export const TIPOS_EXAMEN = ['examen_teorico', 'examen_practico', 'recuperacion'] as const

const NOMBRE_TIPO: Record<string, string> = {
  examen_teorico: 'Teórico',
  examen_practico: 'Práctico',
  recuperacion: 'Recuperación',
}

/** Módulos de 2º SMR con color propio en tokens.css (clase .mod-<abreviatura>). */
const MODULOS_CON_COLOR = new Set(['sor', 'si', 'sr', 'ao', 'cnv', 'ipe2', 'pi', 'fe'])

export interface EvaluacionBasica {
  id: string
  modulo_id: string
  titulo: string
  tipo: string
  /** Instante (timestamptz en ISO). */
  fecha: string
  estado: string
}

export interface ModuloBasico {
  id: string
  nombre: string
  abreviatura: string
}

export interface ProximoExamen {
  id: string
  titulo: string
  tipo: string
  modulo: { nombre: string; abreviatura: string; clase: string | null } | null
  /** Día del examen en Madrid. */
  dia: FechaDia
  /** "13/11/2026" */
  fecha: string
  /** "09:30", o null si no tiene hora (medianoche en Madrid). */
  hora: string | null
  /** Días que faltan (0 = hoy). */
  dias: number
}

const formatoHora = new Intl.DateTimeFormat('es-ES', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** Clase de color del módulo (".mod-sor"…), o null si no es uno de los de 2º SMR. */
export function claseDeModulo(abreviatura: string): string | null {
  const clave = abreviatura.trim().toLowerCase()
  return MODULOS_CON_COLOR.has(clave) ? `mod-${clave}` : null
}

/**
 * El examen pendiente más cercano de hoy en adelante (en hora de Madrid), o
 * null. Los de hoy cuentan aunque ya haya pasado la hora: el día aún no ha
 * acabado y puede que no hayas apuntado la nota.
 */
export function proximoExamen(
  evaluaciones: readonly EvaluacionBasica[],
  modulos: readonly ModuloBasico[],
  hoy: FechaDia,
): ProximoExamen | null {
  const tipos: ReadonlySet<string> = new Set(TIPOS_EXAMEN)
  let mejor: { e: EvaluacionBasica; dia: FechaDia; ms: number } | null = null
  for (const e of evaluaciones) {
    if (!tipos.has(e.tipo) || e.estado !== 'pendiente') continue
    const ms = Date.parse(e.fecha)
    if (Number.isNaN(ms)) continue
    const dia = diaEnMadrid(ms)
    if (dia < hoy) continue
    if (!mejor || ms < mejor.ms || (ms === mejor.ms && e.id < mejor.e.id)) mejor = { e, dia, ms }
  }
  if (!mejor) return null

  const { e, dia, ms } = mejor
  const modulo = modulos.find((m) => m.id === e.modulo_id)
  const hora = formatoHora.format(ms)
  return {
    id: e.id,
    titulo: e.titulo,
    tipo: NOMBRE_TIPO[e.tipo] ?? e.tipo,
    modulo: modulo ? { nombre: modulo.nombre, abreviatura: modulo.abreviatura, clase: claseDeModulo(modulo.abreviatura) } : null,
    dia,
    fecha: formatearFecha(dia),
    hora: hora === '00:00' ? null : hora,
    dias: diferenciaDias(hoy, dia),
  }
}

/** "Hoy", "Mañana" o "En 5 días". */
export function textoCuentaAtras(dias: number): string {
  if (dias <= 0) return 'Hoy'
  if (dias === 1) return 'Mañana'
  return `En ${dias} días`
}
