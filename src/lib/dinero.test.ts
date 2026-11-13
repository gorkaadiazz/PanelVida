import { describe, expect, it } from 'vitest'
import {
  centimosATexto,
  ErrorDeValidacion,
  formatearEuros,
  mesDe,
  movimientosDelMes,
  nombreMes,
  parsearImporte,
  parsearMeta,
  progresoMeta,
  resumenMes,
  resumir,
  sumarMeses,
  ultimosMeses,
  validarConcepto,
  validarFechaMovimiento,
  validarTipo,
  type MovimientoBasico,
} from './dinero'

// Intl separa la cifra y el € con un espacio duro: se normaliza para comparar
const euros = (c: number) => formatearEuros(c).replace(/\s/g, ' ')

describe('parsearImporte (siempre a céntimos enteros)', () => {
  it.each([
    ['12', 1200],
    ['12,5', 1250],
    ['12,50', 1250],
    ['12.50', 1250],
    ['0,01', 1],
    ['0,1', 10],
    ['1.234,56', 123456],
    ['1 234,56', 123456],
    ['1.234', 123400],
    ['12 €', 1200],
    ['  7,05 ', 705],
  ])('"%s" → %i', (texto, centimos) => {
    expect(parsearImporte(texto)).toBe(centimos)
  })

  it('sin errores de coma flotante: 0,1 + 0,2 = 0,30 exactos', () => {
    expect(parsearImporte('0,1') + parsearImporte('0,2')).toBe(parsearImporte('0,3'))
    expect(parsearImporte('19,99')).toBe(1999) // 19.99 * 100 = 1998.9999… en coma flotante
    expect(parsearImporte('4,35')).toBe(435) // 4.35 * 100 = 434.99999…
  })

  it.each(['', '   ', 'abc', '12,345', '-5', '0', '0,00', '1,2,3', '12e3', '€'])('rechaza "%s"', (texto) => {
    expect(() => parsearImporte(texto)).toThrow(ErrorDeValidacion)
  })

  it('rechaza importes por encima del tope del servidor', () => {
    expect(() => parsearImporte('1000000000')).toThrow(ErrorDeValidacion)
    expect(parsearImporte('999999999,99')).toBe(99_999_999_999)
  })
})

describe('formato', () => {
  it('euros en español', () => {
    expect(euros(1250)).toBe('12,50 €')
    expect(euros(123456)).toBe('1234,56 €') // norma española: sin punto con 4 cifras
    expect(euros(1234567)).toBe('12.345,67 €')
    expect(euros(-300)).toBe('-3,00 €')
    expect(euros(0)).toBe('0,00 €')
  })

  it('céntimos a texto de campo', () => {
    expect(centimosATexto(1250)).toBe('12,50')
    expect(centimosATexto(5)).toBe('0,05')
    expect(centimosATexto(-705)).toBe('-7,05')
  })

  it('meses', () => {
    expect(mesDe('2026-11-13')).toBe('2026-11')
    expect(sumarMeses('2026-11', 1)).toBe('2026-12')
    expect(sumarMeses('2026-12', 1)).toBe('2027-01')
    expect(sumarMeses('2026-01', -1)).toBe('2025-12')
    expect(sumarMeses('2026-11', -5)).toBe('2026-06')
    expect(sumarMeses('2026-03', -15)).toBe('2024-12')
    expect(nombreMes('2026-11')).toBe('noviembre de 2026')
  })
})

describe('validación', () => {
  it('concepto', () => {
    expect(validarConcepto('  Cine   con  amigos ')).toBe('Cine con amigos')
    expect(() => validarConcepto('   ')).toThrow(ErrorDeValidacion)
    expect(() => validarConcepto('x'.repeat(121))).toThrow(ErrorDeValidacion)
  })
  it('tipo y fecha', () => {
    expect(validarTipo('gasto')).toBe('gasto')
    expect(() => validarTipo('regalo')).toThrow(ErrorDeValidacion)
    expect(validarFechaMovimiento('2026-02-28')).toBe('2026-02-28')
    expect(() => validarFechaMovimiento('2026-02-30')).toThrow(ErrorDeValidacion)
  })
})

const mov = (tipo: string, importe_centimos: number, fecha: string): MovimientoBasico => ({ tipo, importe_centimos, fecha })

describe('resúmenes', () => {
  const MOVS = [
    mov('ingreso', 50000, '2026-11-01'),
    mov('gasto', 1250, '2026-11-13'),
    mov('gasto', 999, '2026-11-30'),
    mov('ingreso', 10000, '2026-10-31'),
    mov('gasto', 30000, '2026-12-01'),
    mov('raro', 777, '2026-11-02'), // tipo desconocido: no cuenta
  ]

  it('del mes: los límites del mes cuentan bien', () => {
    expect(resumenMes(MOVS, '2026-11')).toEqual({ ingresos: 50000, gastos: 2249, ahorro: 47751 })
    expect(resumenMes(MOVS, '2026-12')).toEqual({ ingresos: 0, gastos: 30000, ahorro: -30000 })
    expect(resumenMes([], '2026-11')).toEqual({ ingresos: 0, gastos: 0, ahorro: 0 })
  })

  it('total', () => {
    expect(resumir(MOVS).ahorro).toBe(60000 - 32249)
  })

  it('6 meses hasta el actual, también cruzando el año y con meses vacíos', () => {
    const barras = ultimosMeses(MOVS, '2027-02')
    expect(barras.map((b) => b.mes)).toEqual(['2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02'])
    expect(barras.map((b) => b.etiqueta)).toEqual(['sept', 'oct', 'nov', 'dic', 'ene', 'feb'])
    expect(barras[1]).toMatchObject({ ingresos: 10000, gastos: 0, ahorro: 10000 })
    expect(barras[3].ahorro).toBe(-30000)
    expect(barras[4]).toMatchObject({ ingresos: 0, gastos: 0, ahorro: 0, nombre: 'enero de 2027' })
  })

  it('movimientos del mes: el más reciente primero y, el mismo día, el último apuntado primero', () => {
    const lista = [
      { ...mov('gasto', 1, '2026-11-05'), id: 'a', created_at: '2026-11-05T10:00:00Z' },
      { ...mov('gasto', 2, '2026-11-20'), id: 'b', created_at: '2026-11-01T10:00:00Z' },
      { ...mov('gasto', 3, '2026-11-05'), id: 'c', created_at: '2026-11-05T12:00:00Z' },
      { ...mov('gasto', 4, '2026-10-30'), id: 'd', created_at: '2026-10-30T12:00:00Z' },
    ]
    expect(movimientosDelMes(lista, '2026-11').map((m) => m.id)).toEqual(['b', 'c', 'a'])
  })
})

describe('meta de ahorro', () => {
  it('sin meta no hay progreso', () => {
    expect(progresoMeta(5000, null)).toBeNull()
    expect(progresoMeta(5000, 0)).toBeNull()
  })
  it('porcentaje redondeado hacia abajo y limitado a 0-100', () => {
    expect(progresoMeta(33333, 100000)).toEqual({ porcentaje: 33, conseguida: false, faltan: 66667 })
    expect(progresoMeta(99999, 100000)?.porcentaje).toBe(99) // no se ve "100 %" sin haber llegado
    expect(progresoMeta(150000, 100000)).toEqual({ porcentaje: 100, conseguida: true, faltan: 0 })
    expect(progresoMeta(-5000, 100000)).toEqual({ porcentaje: 0, conseguida: false, faltan: 105000 })
  })
  it('parsearMeta: vacío = sin meta', () => {
    expect(parsearMeta('  ')).toBeNull()
    expect(parsearMeta('1.000')).toBe(100000)
    expect(() => parsearMeta('mil')).toThrow(ErrorDeValidacion)
  })
})
