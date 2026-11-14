import { describe, expect, it } from 'vitest'
import { ErrorDeValidacion, fechaEnAnio, ordenarPorProximo, proximo, proximosDias, textoCuentaAtras, textoDiaMes, validarCumple } from './cumpleanos'

const c = (dia: number, mes: number, anio: number | null = null, nombre = 'Ana') => ({ id: nombre, nombre, dia, mes, anio })

describe('próximo cumpleaños', () => {
  it('este año si no ha pasado (hoy cuenta); si no, el que viene', () => {
    expect(proximo(c(20, 11), '2026-11-14')).toMatchObject({ fecha: '2026-11-20', dias: 6 })
    expect(proximo(c(14, 11), '2026-11-14')).toMatchObject({ fecha: '2026-11-14', dias: 0 })
    expect(proximo(c(13, 11), '2026-11-14')).toMatchObject({ fecha: '2027-11-13', dias: 364 })
  })
  it('el 29 de febrero se celebra el 28 en años no bisiestos', () => {
    expect(fechaEnAnio(29, 2, 2027)).toBe('2027-02-28')
    expect(fechaEnAnio(29, 2, 2028)).toBe('2028-02-29')
    expect(proximo(c(29, 2), '2027-02-28')).toMatchObject({ fecha: '2027-02-28', dias: 0 })
    expect(proximo(c(29, 2), '2027-03-01')).toMatchObject({ fecha: '2028-02-29' })
    expect(proximo(c(29, 2), '2028-02-28')).toMatchObject({ fecha: '2028-02-29', dias: 1 })
  })
  it('edad que cumple (solo si hay año)', () => {
    expect(proximo(c(20, 11, 2000), '2026-11-14').edad).toBe(26)
    expect(proximo(c(13, 11, 2000), '2026-11-14').edad).toBe(27) // ya pasó: el que viene cumple 27
    expect(proximo(c(20, 11), '2026-11-14').edad).toBeNull()
    expect(proximo(c(29, 2, 2004), '2027-01-10')).toMatchObject({ fecha: '2027-02-28', edad: 23 })
  })
  it('cruza el año', () => {
    expect(proximo(c(2, 1), '2026-12-30')).toMatchObject({ fecha: '2027-01-02', dias: 3 })
  })
})

describe('listas', () => {
  const lista = [c(1, 1, null, 'Enero'), c(20, 11, null, 'Zoe'), c(20, 11, null, 'Bea'), c(14, 11, null, 'Hoy'), c(22, 11, null, 'Ocho días')]
  it('ordena por el más cercano y desempata por nombre', () => {
    expect(ordenarPorProximo(lista, '2026-11-14').map((p) => p.cumple.nombre)).toEqual(['Hoy', 'Bea', 'Zoe', 'Ocho días', 'Enero'])
  })
  it('Inicio: de hoy a dentro de 7 días', () => {
    expect(proximosDias(lista, '2026-11-14').map((p) => p.cumple.nombre)).toEqual(['Hoy', 'Bea', 'Zoe'])
    expect(proximosDias(lista, '2026-11-15').map((p) => p.cumple.nombre)).toEqual(['Bea', 'Zoe', 'Ocho días'])
  })
})

describe('textos', () => {
  it('cuenta atrás', () => {
    expect(textoCuentaAtras(0)).toBe('hoy')
    expect(textoCuentaAtras(1)).toBe('mañana')
    expect(textoCuentaAtras(5)).toBe('en 5 días')
  })
  it('día y mes', () => {
    expect(textoDiaMes(29, 2)).toBe('29 de febrero')
  })
})

describe('validar', () => {
  const hoy = '2026-11-14'
  const v = (cambios: Partial<Parameters<typeof validarCumple>[0]>) => validarCumple({ nombre: 'Ana', dia: '5', mes: '3', anio: '', notas: '', ...cambios }, hoy)
  it('acepta lo normal, sin año y el 29 de febrero', () => {
    expect(v({})).toEqual({ nombre: 'Ana', dia: 5, mes: 3, anio: null, notas: '' })
    expect(v({ dia: '29', mes: '2' }).dia).toBe(29)
    expect(v({ dia: '29', mes: '2', anio: '2004' }).anio).toBe(2004)
    expect(v({ nombre: '  Ana   Mari ', anio: ' 1999 ' })).toMatchObject({ nombre: 'Ana Mari', anio: 1999 })
  })
  it.each([
    [{ nombre: ' ' }],
    [{ nombre: 'x'.repeat(81) }],
    [{ mes: '' }],
    [{ mes: '13' }],
    [{ dia: '31', mes: '4' }],
    [{ dia: '30', mes: '2' }],
    [{ dia: '0' }],
    [{ dia: '29', mes: '2', anio: '2003' }],
    [{ anio: '1899' }],
    [{ anio: '2027' }],
    [{ anio: 'mil' }],
    [{ notas: 'x'.repeat(501) }],
  ])('rechaza %j', (cambios) => {
    expect(() => v(cambios)).toThrow(ErrorDeValidacion)
  })
})
