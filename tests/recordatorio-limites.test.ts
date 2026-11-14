// Recordatorios: el cron llama cada hora (minuto 5 UTC). Cada usuario debe
// coincidir con SU hora de Madrid exactamente una vez al día, también los
// días del cambio de hora. Y los textos, sin nombres y bien en plural.
import { describe, expect, it } from 'vitest'
import { contarPendientes, enMadrid, textoRecordatorio } from '../supabase/functions/_shared/recordatorio.ts'
import { HORAS } from '../src/lib/recordatorios'

/** Llamadas del cron (minuto 5 de cada hora UTC) que caen en el día `dia` de Madrid, por hora de Madrid. */
function llamadasDelDia(dia: string): Map<number, number> {
  const veces = new Map<number, number>()
  const inicio = Date.parse(`${dia}T00:05:00Z`) - 3 * 3_600_000
  for (let i = 0; i < 30; i++) {
    const m = enMadrid(inicio + i * 3_600_000)
    if (m.dia === dia) veces.set(m.hora, (veces.get(m.hora) ?? 0) + 1)
  }
  return veces
}

describe('hora de Madrid en el cron', () => {
  it.each([
    ['2026-03-29', 'entra el horario de verano'],
    ['2026-10-25', 'sale el horario de verano'],
    ['2026-03-28', 'día antes'],
    ['2026-10-26', 'día después'],
    ['2026-07-14', 'verano'],
    ['2026-12-31', 'fin de año'],
  ])('%s (%s): cada hora elegible (7-23) toca exactamente una vez', (dia) => {
    const veces = llamadasDelDia(dia)
    for (const h of HORAS) expect(veces.get(h), `hora ${h}`).toBe(1)
  })

  it('la hora repetida (02:00 del 25/10) y la que no existe (02:00 del 29/3) no son elegibles', () => {
    expect(llamadasDelDia('2026-10-25').get(2)).toBe(2)
    expect(llamadasDelDia('2026-03-29').get(2)).toBeUndefined()
    expect(HORAS).not.toContain(2)
    expect(Math.min(...HORAS)).toBe(7)
    expect(Math.max(...HORAS)).toBe(23)
  })

  it('a las 20:05 de Madrid el cron llama a las 19:05 UTC en invierno y a las 18:05 en verano', () => {
    expect(enMadrid('2026-01-10T19:05:00Z')).toEqual({ dia: '2026-01-10', hora: 20 })
    expect(enMadrid('2026-06-10T18:05:00Z')).toEqual({ dia: '2026-06-10', hora: 20 })
    expect(enMadrid('2026-12-31T23:05:00Z')).toEqual({ dia: '2027-01-01', hora: 0 })
  })
})

describe('qué se cuenta según el día de Madrid', () => {
  it('un examen a las 00:30 de mañana en verano (22:30 UTC de hoy) es de mañana; uno a las 23:30 de hoy, no', () => {
    const p = contarPendientes(
      {
        habitos: [],
        marcas: [],
        tareas: [],
        evaluaciones: [
          { tipo: 'examen_teorico', estado: 'pendiente', fecha: '2026-06-10T22:30:00+00:00' },
          { tipo: 'examen_teorico', estado: 'pendiente', fecha: '2026-06-10T21:30:00+00:00' },
          { tipo: 'recuperacion', estado: 'pendiente', fecha: '2026-06-11T21:59:00+00:00' }, // 23:59 del 11
          { tipo: 'recuperacion', estado: 'pendiente', fecha: '2026-06-11T22:00:00+00:00' }, // 00:00 del 12
        ],
      },
      '2026-06-10',
    )
    expect(p.examenesManana).toBe(2)
  })

  it('mañana cruza mes y año (31/12 → 1/1)', () => {
    const p = contarPendientes(
      { habitos: [], marcas: [], tareas: [{ hecha: false, fecha_limite: '2027-01-01' }], evaluaciones: [] },
      '2026-12-31',
    )
    expect(p).toMatchObject({ tareasManana: 1, tareasHoy: 0, tareasAtrasadas: 0 })
  })

  it('una marca desmarcada (hecho=false) hoy no cuenta como hecha', () => {
    const p = contarPendientes(
      { habitos: [{ id: 'a', archivado: false }], marcas: [{ habito_id: 'a', fecha: '2026-11-14', hecho: false }], tareas: [], evaluaciones: [] },
      '2026-11-14',
    )
    expect(p.habitos).toBe(1)
  })
})

describe('textos del recordatorio', () => {
  const nada = { habitos: 0, tareasAtrasadas: 0, tareasHoy: 0, tareasManana: 0, examenesManana: 0 }
  it('todo a la vez, en orden: examen, hábitos, tareas', () => {
    expect(textoRecordatorio({ habitos: 2, tareasAtrasadas: 1, tareasHoy: 3, tareasManana: 4, examenesManana: 2 })).toEqual({
      titulo: 'Mañana hay examen',
      cuerpo: 'Mañana tienes 2 exámenes. Te quedan 2 hábitos por marcar hoy. Tareas: 1 atrasada, 3 para hoy, 4 para mañana.',
    })
  })
  it('solo tareas de mañana también avisa', () => {
    expect(textoRecordatorio({ ...nada, tareasManana: 1 })).toEqual({ titulo: 'Mi Panel', cuerpo: 'Tareas: 1 para mañana.' })
  })
  it('nunca lleva nombres: solo cifras y texto fijo', () => {
    const t = textoRecordatorio({ habitos: 5, tareasAtrasadas: 5, tareasHoy: 5, tareasManana: 5, examenesManana: 5 })
    expect(t?.cuerpo.replace(/\d+/g, 'N')).toBe(
      'Mañana tienes N exámenes. Te quedan N hábitos por marcar hoy. Tareas: N atrasadas, N para hoy, N para mañana.',
    )
  })
})
