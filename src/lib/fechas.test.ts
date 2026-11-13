import { describe, expect, it } from 'vitest'
import {
  diaDelMes,
  diaEnMadrid,
  diaSemanaCorto,
  diaSemanaLargo,
  diferenciaDias,
  esFechaDia,
  formatearFecha,
  hoy,
  restarDias,
  sumarDias,
  ultimosDias,
} from './fechas'

describe('hoy (hora de Madrid)', () => {
  it('en invierno Madrid va 1 h por delante de UTC', () => {
    expect(hoy(new Date('2026-11-13T22:59:59Z'))).toBe('2026-11-13')
    expect(hoy(new Date('2026-11-13T23:00:00Z'))).toBe('2026-11-14')
  })

  it('en verano Madrid va 2 h por delante de UTC', () => {
    expect(hoy(new Date('2026-07-01T21:59:59Z'))).toBe('2026-07-01')
    expect(hoy(new Date('2026-07-01T22:00:00Z'))).toBe('2026-07-02')
  })

  it('acierta la noche del cambio a horario de verano (29/03/2026)', () => {
    expect(hoy(new Date('2026-03-28T22:59:59Z'))).toBe('2026-03-28')
    expect(hoy(new Date('2026-03-28T23:00:00Z'))).toBe('2026-03-29')
    // Tras el salto de las 2:00 a las 3:00 ya son 2 h de diferencia
    expect(hoy(new Date('2026-03-29T21:59:59Z'))).toBe('2026-03-29')
    expect(hoy(new Date('2026-03-29T22:00:00Z'))).toBe('2026-03-30')
  })

  it('acierta la noche del cambio a horario de invierno (25/10/2026)', () => {
    expect(hoy(new Date('2026-10-24T21:59:59Z'))).toBe('2026-10-24')
    expect(hoy(new Date('2026-10-24T22:00:00Z'))).toBe('2026-10-25')
    expect(hoy(new Date('2026-10-25T22:59:59Z'))).toBe('2026-10-25')
    expect(hoy(new Date('2026-10-25T23:00:00Z'))).toBe('2026-10-26')
  })

  it('cambia de año a medianoche de Madrid', () => {
    expect(hoy(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01')
  })

  it('diaEnMadrid acepta una cadena ISO (p. ej. hecha_en)', () => {
    expect(diaEnMadrid('2026-11-13T23:30:00+00:00')).toBe('2026-11-14')
    expect(() => diaEnMadrid('no es una fecha')).toThrow(RangeError)
  })
})

describe('esFechaDia', () => {
  it('acepta días que existen', () => {
    expect(esFechaDia('2026-11-13')).toBe(true)
    expect(esFechaDia('2028-02-29')).toBe(true)
  })

  it('rechaza formatos raros y días que no existen', () => {
    for (const mala of ['2026-02-30', '2026-13-01', '2026-00-10', '2027-02-29', '13/11/2026', '2026-1-5', '', '2026-11-13T10:00:00Z']) {
      expect(esFechaDia(mala), mala).toBe(false)
    }
    expect(esFechaDia(null)).toBe(false)
    expect(esFechaDia(20261113)).toBe(false)
  })
})

describe('sumarDias y restarDias', () => {
  it('cruzan meses y años', () => {
    expect(sumarDias('2026-11-30', 1)).toBe('2026-12-01')
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01')
    expect(restarDias('2027-01-01', 1)).toBe('2026-12-31')
    expect(sumarDias('2026-11-13', 0)).toBe('2026-11-13')
  })

  it('respetan los bisiestos', () => {
    expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29')
    expect(sumarDias('2027-02-28', 1)).toBe('2027-03-01')
  })

  it('no se saltan ni repiten días en los cambios de hora', () => {
    expect(sumarDias('2026-03-28', 1)).toBe('2026-03-29')
    expect(sumarDias('2026-03-29', 1)).toBe('2026-03-30')
    expect(sumarDias('2026-10-24', 1)).toBe('2026-10-25')
    expect(sumarDias('2026-10-25', 1)).toBe('2026-10-26')
    expect(restarDias('2026-10-26', 1)).toBe('2026-10-25')
  })

  it('lanzan con una fecha no válida', () => {
    expect(() => sumarDias('2026-02-30', 1)).toThrow(RangeError)
    expect(() => sumarDias('ayer', 1)).toThrow(RangeError)
  })
})

describe('diferenciaDias', () => {
  it('cuenta días naturales con signo', () => {
    expect(diferenciaDias('2026-11-13', '2026-11-13')).toBe(0)
    expect(diferenciaDias('2026-11-13', '2026-11-14')).toBe(1)
    expect(diferenciaDias('2026-11-14', '2026-11-13')).toBe(-1)
    expect(diferenciaDias('2026-01-01', '2027-01-01')).toBe(365)
  })

  it('no se descuadra al cruzar un cambio de hora', () => {
    expect(diferenciaDias('2026-03-28', '2026-03-30')).toBe(2)
    expect(diferenciaDias('2026-10-24', '2026-10-26')).toBe(2)
  })
})

describe('ultimosDias', () => {
  it('devuelve n días acabando en el indicado, del más antiguo al más reciente', () => {
    expect(ultimosDias(7, '2026-11-13')).toEqual([
      '2026-11-07',
      '2026-11-08',
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
    ])
  })

  it('cruza el cambio de hora sin repetir días', () => {
    expect(ultimosDias(3, '2026-10-26')).toEqual(['2026-10-24', '2026-10-25', '2026-10-26'])
  })

  it('con 0 o negativo devuelve lista vacía', () => {
    expect(ultimosDias(0, '2026-11-13')).toEqual([])
    expect(ultimosDias(-2, '2026-11-13')).toEqual([])
  })
})

describe('formato español', () => {
  it('formatearFecha da dd/mm/aaaa', () => {
    expect(formatearFecha('2026-11-13')).toBe('13/11/2026')
    expect(formatearFecha('2026-01-05')).toBe('05/01/2026')
  })

  it('diaSemanaCorto da el nombre corto sin punto', () => {
    // El 9 de noviembre de 2026 es lunes
    expect(ultimosDias(7, '2026-11-15').map(diaSemanaCorto)).toEqual(['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'])
  })

  it('diaSemanaLargo y diaDelMes', () => {
    expect(diaSemanaLargo('2026-11-13')).toBe('viernes')
    expect(diaDelMes('2026-11-03')).toBe(3)
  })
})
