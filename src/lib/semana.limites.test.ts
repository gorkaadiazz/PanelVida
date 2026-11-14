// Casos límite de la tarjeta «Esta semana»: domingo, cambio de año, cambio
// de hora en Madrid y tareas hechas justo a medianoche.
import { describe, expect, it } from 'vitest'
import { lunesDe, resumenSemana } from './semana'

const vacio = { habitos: [], marcas: [], tareas: [], movimientos: [] }
const tareas = (...instantes: string[]) => instantes.map((hecha_en) => ({ hecha: true, hecha_en }))

describe('semana: domingo y cambio de año', () => {
  it('el domingo cuenta los 7 días y se compara con la semana pasada entera', () => {
    const r = resumenSemana(
      {
        habitos: [{ id: 'h', nombre: 'Leer', orden: 0, archivado: false }],
        marcas: [
          { habito_id: 'h', fecha: '2026-11-16', hecho: true },
          { habito_id: 'h', fecha: '2026-11-22', hecho: true },
          { habito_id: 'h', fecha: '2026-11-15', hecho: true }, // domingo pasado
          { habito_id: 'h', fecha: '2026-11-08', hecho: true }, // fuera
        ],
        tareas: [],
        movimientos: [],
      },
      '2026-11-22',
    )
    expect(r).toMatchObject({ desde: '2026-11-16', dias: 7 })
    expect(r.actual).toMatchObject({ habitosHechos: 2, habitosPosibles: 7 })
    expect(r.anterior).toMatchObject({ habitosHechos: 1, habitosPosibles: 7 })
  })

  it('una semana que cruza el año: viernes 1/1/2027 empieza el lunes 28/12 y se compara con 21-25/12', () => {
    const r = resumenSemana(
      {
        ...vacio,
        movimientos: [
          { tipo: 'gasto', importe_centimos: 1999, fecha: '2026-12-28' },
          { tipo: 'ingreso', importe_centimos: 5001, fecha: '2027-01-01' },
          { tipo: 'gasto', importe_centimos: 101, fecha: '2026-12-25' },
          { tipo: 'gasto', importe_centimos: 999, fecha: '2026-12-26' }, // sábado pasado: fuera
        ],
      },
      '2027-01-01',
    )
    expect(r).toMatchObject({ desde: '2026-12-28', dias: 5 })
    expect(r.actual.ahorro).toBe(3002)
    expect(r.anterior.ahorro).toBe(-101)
  })

  it('lunes de las semanas del cambio de hora (fechas de día: no les afecta)', () => {
    expect(lunesDe('2026-03-29')).toBe('2026-03-23') // domingo, entra el horario de verano
    expect(lunesDe('2026-03-30')).toBe('2026-03-30')
    expect(lunesDe('2026-10-25')).toBe('2026-10-19') // domingo, sale el horario de verano
    expect(lunesDe('2026-10-26')).toBe('2026-10-26')
    expect(lunesDe('2028-02-29')).toBe('2028-02-28')
  })
})

describe('semana: tareas hechas a medianoche (hora de Madrid)', () => {
  it('en invierno (UTC+1): las 23:00 UTC del domingo ya son el lunes en Madrid', () => {
    // hoy: lunes 16/11/2026 → esta semana solo el 16; la pasada, solo el lunes 9
    const r = resumenSemana({ ...vacio, tareas: tareas('2026-11-15T22:59:59.999Z', '2026-11-15T23:00:00.000Z') }, '2026-11-16')
    expect(r.actual.tareasHechas).toBe(1)
    expect(r.anterior.tareasHechas).toBe(0) // la del domingo 15 no es del lunes 9
  })

  it('en verano (UTC+2): las 22:00 UTC del domingo ya son el lunes', () => {
    const r = resumenSemana({ ...vacio, tareas: tareas('2026-07-19T21:59:59Z', '2026-07-19T22:00:00Z') }, '2026-07-20')
    expect(r.actual.tareasHechas).toBe(1)
  })

  it('la semana en que sale el horario de verano (domingo 25/10/2026): el domingo dura 25 h', () => {
    const r = resumenSemana(
      {
        ...vacio,
        tareas: tareas(
          '2026-10-18T22:00:00Z', // 00:00 del lunes 19 (verano): dentro
          '2026-10-18T21:59:00Z', // 23:59 del domingo 18: fuera
          '2026-10-25T00:30:00Z', // 02:30 CEST del domingo 25: dentro
          '2026-10-25T01:30:00Z', // 02:30 CET (la hora repetida): dentro
          '2026-10-25T22:59:59Z', // 23:59:59 CET del domingo 25: dentro
          '2026-10-25T23:00:00Z', // 00:00 del lunes 26: fuera
        ),
      },
      '2026-10-25',
    )
    expect(r).toMatchObject({ desde: '2026-10-19', dias: 7 })
    expect(r.actual.tareasHechas).toBe(4)
  })

  it('la semana en que entra el horario de verano (domingo 29/3/2026): el domingo dura 23 h', () => {
    const r = resumenSemana(
      {
        ...vacio,
        tareas: tareas(
          '2026-03-22T23:00:00Z', // 00:00 CET del lunes 23: dentro
          '2026-03-29T00:59:59Z', // 01:59:59 CET del domingo 29: dentro
          '2026-03-29T01:00:00Z', // 03:00 CEST del domingo 29: dentro
          '2026-03-29T21:59:59Z', // 23:59:59 CEST: dentro
          '2026-03-29T22:00:00Z', // 00:00 del lunes 30: fuera
        ),
      },
      '2026-03-29',
    )
    expect(r.actual.tareasHechas).toBe(4)
  })

  it('una tarea marcada y luego desmarcada (hecha=false con hecha_en) no cuenta', () => {
    const r = resumenSemana({ ...vacio, tareas: [{ hecha: false, hecha_en: '2026-11-16T10:00:00Z' }] }, '2026-11-16')
    expect(r.actual.tareasHechas).toBe(0)
  })
})
