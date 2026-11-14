import { describe, expect, it } from 'vitest'
import { contarPendientes, diaSiguiente, enMadrid, textoRecordatorio } from '../supabase/functions/_shared/recordatorio.ts'

describe('hora de Madrid', () => {
  it('día y hora en Madrid, también con cambio de hora y de día', () => {
    expect(enMadrid('2026-11-14T19:00:00Z')).toEqual({ dia: '2026-11-14', hora: 20 }) // invierno, UTC+1
    expect(enMadrid('2026-07-14T18:00:00Z')).toEqual({ dia: '2026-07-14', hora: 20 }) // verano, UTC+2
    expect(enMadrid('2026-11-14T23:30:00Z')).toEqual({ dia: '2026-11-15', hora: 0 })
  })
  it('día siguiente cruzando mes y año', () => {
    expect(diaSiguiente('2026-12-31')).toBe('2027-01-01')
    expect(diaSiguiente('2028-02-28')).toBe('2028-02-29')
  })
})

describe('qué hay pendiente', () => {
  const hoy = '2026-11-14'
  it('cuenta hábitos sin marcar, tareas por fecha y exámenes de mañana', () => {
    const p = contarPendientes(
      {
        habitos: [
          { id: 'a', archivado: false },
          { id: 'b', archivado: false },
          { id: 'c', archivado: true },
        ],
        marcas: [
          { habito_id: 'a', fecha: hoy, hecho: true },
          { habito_id: 'b', fecha: '2026-11-13', hecho: true },
        ],
        tareas: [
          { hecha: false, fecha_limite: '2026-11-10' },
          { hecha: false, fecha_limite: hoy },
          { hecha: false, fecha_limite: '2026-11-15' },
          { hecha: true, fecha_limite: '2026-11-15' },
          { hecha: false, fecha_limite: null },
        ],
        evaluaciones: [
          { tipo: 'examen_teorico', estado: 'pendiente', fecha: '2026-11-15T08:30:00Z' },
          { tipo: 'examen_practico', estado: 'pendiente', fecha: '2026-11-14T23:30:00Z' }, // 00:30 del 15 en Madrid
          { tipo: 'practica', estado: 'pendiente', fecha: '2026-11-15T08:30:00Z' }, // no es examen
          { tipo: 'examen_teorico', estado: 'aprobado', fecha: '2026-11-15T08:30:00Z' },
          { tipo: 'examen_teorico', estado: 'pendiente', fecha: 'mal' },
        ],
      },
      hoy,
    )
    expect(p).toEqual({ habitos: 1, tareasAtrasadas: 1, tareasHoy: 1, tareasManana: 1, examenesManana: 2 })
  })
})

describe('texto', () => {
  const nada = { habitos: 0, tareasAtrasadas: 0, tareasHoy: 0, tareasManana: 0, examenesManana: 0 }
  it('sin nada pendiente no se envía', () => {
    expect(textoRecordatorio(nada)).toBeNull()
  })
  it('singular y plural, sin nombres (se ve con el móvil bloqueado)', () => {
    expect(textoRecordatorio({ ...nada, habitos: 1 })).toEqual({ titulo: 'Mi Panel', cuerpo: 'Te queda 1 hábito por marcar hoy.' })
    expect(textoRecordatorio({ ...nada, habitos: 3, tareasAtrasadas: 2, tareasManana: 1 })?.cuerpo).toBe(
      'Te quedan 3 hábitos por marcar hoy. Tareas: 2 atrasadas, 1 para mañana.',
    )
    expect(textoRecordatorio({ ...nada, examenesManana: 1, tareasHoy: 1 })).toEqual({
      titulo: 'Mañana hay examen',
      cuerpo: 'Mañana tienes un examen. Tareas: 1 para hoy.',
    })
  })
})
