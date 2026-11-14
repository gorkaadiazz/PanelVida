// Casos límite de los fijos (lógica pura): fin de mes, bisiestos, cambio de año.
import { describe, expect, it } from 'vitest'
import { desdeAlReanudar, mesesPendientes, mesInicial, proximoApunte, type FijoBasico } from './fijos'

const fijo = (cambios: Partial<FijoBasico> = {}): FijoBasico => ({ id: 'f', dia: 5, desde: '2026-11', ultimo_mes: null, activo: true, ...cambios })

describe('fijos: días 29-31 y febrero', () => {
  it.each([
    [29, '2028-02-29', '2028-02-28', '2028-02-29'],
    [30, '2028-02-29', '2028-02-28', '2028-02-29'],
    [31, '2028-02-29', '2028-02-28', '2028-02-29'],
    [29, '2027-02-28', '2027-02-27', '2027-02-28'],
    [31, '2027-02-28', '2027-02-27', '2027-02-28'],
  ])('día %i: toca el %s (no el %s)', (dia, toca, antes, fecha) => {
    const mes = fecha.slice(0, 7)
    expect(mesesPendientes(fijo({ dia, desde: mes }), antes)).toEqual([])
    expect(mesesPendientes(fijo({ dia, desde: mes }), toca)).toEqual([mes])
    expect(proximoApunte(fijo({ dia, desde: mes }), antes)).toBe(fecha)
  })

  it('creado el 29/2 de un bisiesto con día 30: empieza ese mismo febrero (29 = último día)', () => {
    expect(mesInicial(30, '2028-02-29')).toBe('2028-02')
    expect(mesInicial(28, '2028-02-29')).toBe('2028-03')
  })

  it('el día 31: abril (30), y el próximo apunte tras marzo es el 30/4', () => {
    expect(proximoApunte(fijo({ dia: 31, desde: '2027-01', ultimo_mes: '2027-03' }), '2027-04-01')).toBe('2027-04-30')
    expect(proximoApunte(fijo({ dia: 31, desde: '2027-01', ultimo_mes: '2027-04' }), '2027-04-30')).toBe('2027-05-31')
  })
})

describe('fijos: cambio de año', () => {
  it('diciembre ya apuntado → enero del año siguiente', () => {
    expect(mesesPendientes(fijo({ desde: '2026-01', ultimo_mes: '2026-12' }), '2027-01-04')).toEqual([])
    expect(mesesPendientes(fijo({ desde: '2026-01', ultimo_mes: '2026-12' }), '2027-01-05')).toEqual(['2027-01'])
    expect(proximoApunte(fijo({ desde: '2026-01', ultimo_mes: '2026-12' }), '2026-12-31')).toBe('2027-01-05')
  })
  it('creado el 31/12 con día 31: ese mismo día; con día 1: enero', () => {
    expect(mesInicial(31, '2026-12-31')).toBe('2026-12')
    expect(mesInicial(1, '2026-12-31')).toBe('2027-01')
  })
  it('reanudar el 31/12 un fijo del día 1: empieza en enero', () => {
    expect(desdeAlReanudar(fijo({ dia: 1, desde: '2026-01', ultimo_mes: '2026-06', activo: false }), '2026-12-31')).toBe('2027-01')
  })
  it('un `ultimo_mes` en el futuro (reloj adelantado en otro dispositivo) no apunta nada ni retrocede', () => {
    expect(mesesPendientes(fijo({ desde: '2026-01', ultimo_mes: '2027-03' }), '2026-11-30')).toEqual([])
    expect(proximoApunte(fijo({ desde: '2026-01', ultimo_mes: '2027-03' }), '2026-11-30')).toBe('2027-04-05')
  })
})

describe('fijos: próximo apunte el mismo día', () => {
  it('si hoy toca y aún no se ha apuntado, el próximo es hoy', () => {
    expect(proximoApunte(fijo({ dia: 14, desde: '2026-11' }), '2026-11-14')).toBe('2026-11-14')
    expect(proximoApunte(fijo({ dia: 14, desde: '2026-11', ultimo_mes: '2026-11' }), '2026-11-14')).toBe('2026-12-14')
  })
})
