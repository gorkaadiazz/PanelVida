import { describe, expect, it } from 'vitest'
import {
  desdeAlReanudar,
  diasDelMes,
  fechaEnMes,
  idApunteFijo,
  MAX_MESES_PENDIENTES,
  mesesPendientes,
  mesInicial,
  proximoApunte,
  validarDia,
  type FijoBasico,
} from './fijos'
import { ErrorDeValidacion } from './validacion'

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e'
const fijo = (cambios: Partial<FijoBasico> = {}): FijoBasico => ({ id: ID, dia: 5, desde: '2026-11', ultimo_mes: null, activo: true, ...cambios })

describe('días del mes', () => {
  it('cuenta bien febrero (bisiesto o no) y los meses de 30 y 31', () => {
    expect(diasDelMes('2026-02')).toBe(28)
    expect(diasDelMes('2028-02')).toBe(29)
    expect(diasDelMes('2026-04')).toBe(30)
    expect(diasDelMes('2026-12')).toBe(31)
  })
  it('un fijo del día 31 cae el último día de los meses cortos', () => {
    expect(fechaEnMes('2026-02', 31)).toBe('2026-02-28')
    expect(fechaEnMes('2026-04', 31)).toBe('2026-04-30')
    expect(fechaEnMes('2026-05', 31)).toBe('2026-05-31')
    expect(fechaEnMes('2026-05', 1)).toBe('2026-05-01')
  })
})

describe('mes inicial de un fijo nuevo', () => {
  it('este mes si su día no ha pasado o es hoy', () => {
    expect(mesInicial(20, '2026-11-14')).toBe('2026-11')
    expect(mesInicial(14, '2026-11-14')).toBe('2026-11')
  })
  it('el mes que viene si su día ya pasó (también al cambiar de año)', () => {
    expect(mesInicial(5, '2026-11-14')).toBe('2026-12')
    expect(mesInicial(5, '2026-12-14')).toBe('2027-01')
  })
  it('el día 31 en noviembre (30 días) es el 30', () => {
    expect(mesInicial(31, '2026-11-30')).toBe('2026-11')
  })
})

describe('meses pendientes', () => {
  it('nada antes de que llegue el día', () => {
    expect(mesesPendientes(fijo({ dia: 20 }), '2026-11-14')).toEqual([])
  })
  it('el mes en curso el mismo día que toca', () => {
    expect(mesesPendientes(fijo({ dia: 14 }), '2026-11-14')).toEqual(['2026-11'])
  })
  it('no repite un mes ya apuntado', () => {
    expect(mesesPendientes(fijo({ ultimo_mes: '2026-11' }), '2026-11-30')).toEqual([])
    expect(mesesPendientes(fijo({ ultimo_mes: '2026-11' }), '2026-12-05')).toEqual(['2026-12'])
  })
  it('pone al día los meses que la app estuvo sin abrirse', () => {
    expect(mesesPendientes(fijo({ ultimo_mes: '2026-11' }), '2027-02-10')).toEqual(['2026-12', '2027-01', '2027-02'])
    expect(mesesPendientes(fijo({ ultimo_mes: '2026-11' }), '2027-02-04')).toEqual(['2026-12', '2027-01'])
  })
  it('como mucho los últimos 12 meses', () => {
    const meses = mesesPendientes(fijo({ desde: '2020-01' }), '2026-11-14')
    expect(meses).toHaveLength(MAX_MESES_PENDIENTES)
    expect(meses.at(-1)).toBe('2026-11')
    expect(meses[0]).toBe('2025-12')
  })
  it('en pausa no apunta nada', () => {
    expect(mesesPendientes(fijo({ activo: false }), '2027-05-30')).toEqual([])
  })
  it('respeta `desde` aunque `ultimo_mes` sea anterior (reanudado)', () => {
    expect(mesesPendientes(fijo({ desde: '2027-01', ultimo_mes: '2026-10' }), '2027-01-10')).toEqual(['2027-01'])
  })
  it('un fijo del 31 en febrero se apunta el 28', () => {
    expect(mesesPendientes(fijo({ dia: 31, desde: '2026-02' }), '2026-02-28')).toEqual(['2026-02'])
    expect(mesesPendientes(fijo({ dia: 31, desde: '2026-02' }), '2026-02-27')).toEqual([])
  })
})

describe('id del apunte de cada mes', () => {
  it('es el mismo en todos los dispositivos (determinista) y distinto por mes y por fijo', () => {
    expect(idApunteFijo(ID, '2026-11')).toBe(idApunteFijo(ID.toUpperCase(), '2026-11'))
    expect(idApunteFijo(ID, '2026-11')).not.toBe(idApunteFijo(ID, '2026-12'))
    expect(idApunteFijo(ID, '2026-11')).not.toBe(idApunteFijo('1f8fad5b-d9cb-469f-a165-70867728950e', '2026-11'))
    expect(idApunteFijo(ID, '2026-11')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
  it('no cambia de una versión a otra (si cambia, los dispositivos apuntarían el mes dos veces)', () => {
    expect(idApunteFijo(ID, '2026-11')).toMatchInlineSnapshot(`"f4ec6e37-9ca2-5137-8ff5-92e486c89073"`)
  })
})

describe('próximo apunte', () => {
  it('este mes si no ha llegado el día; si no, el que viene', () => {
    expect(proximoApunte(fijo({ dia: 20 }), '2026-11-14')).toBe('2026-11-20')
    expect(proximoApunte(fijo({ ultimo_mes: '2026-11' }), '2026-11-14')).toBe('2026-12-05')
  })
  it('en pausa no hay', () => {
    expect(proximoApunte(fijo({ activo: false }), '2026-11-14')).toBeNull()
  })
  it('si empieza más adelante, en su primer mes', () => {
    expect(proximoApunte(fijo({ desde: '2027-03' }), '2026-11-14')).toBe('2027-03-05')
  })
})

describe('reanudar', () => {
  it('no recupera los meses en pausa', () => {
    expect(desdeAlReanudar(fijo({ desde: '2026-01', ultimo_mes: '2026-03', activo: false }), '2026-11-14')).toBe('2026-12')
    expect(desdeAlReanudar(fijo({ dia: 20, desde: '2026-01', activo: false }), '2026-11-14')).toBe('2026-11')
  })
  it('si aún no había empezado, conserva su primer mes', () => {
    expect(desdeAlReanudar(fijo({ desde: '2027-03', activo: false }), '2026-11-14')).toBe('2027-03')
  })
})

describe('validar el día', () => {
  it.each([1, 15, 31, '7', ' 28 '])('acepta %s', (d) => {
    expect(validarDia(d)).toBe(Number(String(d).trim()))
  })
  it.each([0, 32, -1, 1.5, '', 'cinco', '5a', Number.NaN])('rechaza %s', (d) => {
    expect(() => validarDia(d)).toThrow(ErrorDeValidacion)
  })
})
