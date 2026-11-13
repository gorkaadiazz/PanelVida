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
  parsearPrecio,
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
    expect(euros(-300)).toBe('−3,00 €')
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

// ---------------------------------------------------------------------------
// Casos límite añadidos por el tester (fase 5)
// ---------------------------------------------------------------------------

describe('parsearImporte: entradas raras', () => {
  it.each([
    ['1.5', 150], // punto decimal con una cifra
    ['1.50', 150],
    ['00,50', 50],
    ['007', 700],
    ['12,5 €', 1250],
    ['12,5€', 1250],
    ['€ 12', 1200],
    ['12,50 €', 1250], // espacio duro (el que pone Intl antes del €)
    ['1 234,56', 123456],
    ['1 234,56', 123456], // espacio duro estrecho (miles en algunos teclados/Intl)
    ['\t12,50\n', 1250],
    ['1.234.567', 123456700],
    ['1.234.567,8', 123456780],
    ['12.345,6', 1234560],
    ['0999999999,99', 99_999_999_999],
  ])('"%s" → %i', (texto, centimos) => {
    expect(parsearImporte(texto)).toBe(centimos)
  })

  it.each([
    '.5', // sin cifra delante: se pide escribirlo bien («0,5»)
    ',5',
    '5.',
    '5,',
    '1,234', // tres decimales: ambiguo, mejor rechazarlo que adivinar
    '1.2345',
    '1.234.5',
    '1,5.000',
    '+5',
    '- 5',
    '１２', // cifras de ancho completo
    '12 EUR',
    '0,001',
    'NaN',
    'Infinity',
  ])('rechaza "%s"', (texto) => {
    expect(() => parsearImporte(texto)).toThrow(ErrorDeValidacion)
  })

  it('cerca del tope: el último céntimo vale y el siguiente no', () => {
    expect(parsearImporte('999.999.999,99')).toBe(99_999_999_999)
    expect(() => parsearImporte('1.000.000.000')).toThrow('demasiado grande')
    expect(() => parsearImporte('1000000000,00')).toThrow('demasiado grande')
  })

  it('un número enorme dice que es demasiado grande (no que tiene que ser mayor que 0)', () => {
    // 20 cifras: ya no es un entero seguro en JavaScript
    expect(() => parsearImporte('99999999999999999999')).toThrow('demasiado grande')
    expect(() => parsearImporte('9'.repeat(400))).toThrow('demasiado grande') // Number() daría Infinity
  })

  it('ida y vuelta: centimosATexto → parsearImporte devuelve los mismos céntimos', () => {
    for (const c of [1, 9, 10, 99, 100, 101, 1999, 435, 123456, 99_999_999_999]) {
      expect(parsearImporte(centimosATexto(c))).toBe(c)
    }
  })
})

describe('formato cerca del tope', () => {
  it('el importe máximo se escribe sin errores de redondeo', () => {
    expect(euros(99_999_999_999)).toBe('999.999.999,99 €')
    expect(euros(-99_999_999_999)).toBe('−999.999.999,99 €')
    expect(centimosATexto(99_999_999_999)).toBe('999999999,99')
  })
})

describe('sumarMeses con muchos meses', () => {
  it.each([
    ['2026-11', 0, '2026-11'],
    ['2026-11', 12, '2027-11'],
    ['2026-11', -12, '2025-11'],
    ['2026-11', 1200, '2126-11'],
    ['2026-01', -1200, '1926-01'],
    ['2026-12', 12_001, '3027-01'],
    ['2026-01', -13, '2024-12'],
    ['2026-11', 1.9, '2026-12'], // se trunca
    ['2026-11', -1.9, '2026-10'],
  ])('%s %+d → %s', (mes, n, esperado) => {
    expect(sumarMeses(mes, n)).toBe(esperado)
  })

  it('sumar y restar lo mismo vuelve al mes de partida', () => {
    for (let k = -500; k <= 500; k += 7) {
      expect(sumarMeses(sumarMeses('2026-11', k), -k)).toBe('2026-11')
    }
  })
})

describe('ultimosMeses en enero (cruza el año)', () => {
  const MOVS = [
    mov('ingreso', 1000, '2026-08-01'),
    mov('gasto', 300, '2026-12-31'),
    mov('ingreso', 700, '2027-01-01'),
    mov('ingreso', 999, '2026-07-31'), // fuera de la ventana
    mov('ingreso', 999, '2027-02-01'), // futuro: fuera
  ]

  it('de agosto a enero, con el último día de diciembre y el primero de enero en su mes', () => {
    const barras = ultimosMeses(MOVS, '2027-01')
    expect(barras.map((b) => b.mes)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01'])
    expect(barras.map((b) => b.ahorro)).toEqual([1000, 0, 0, 0, -300, 700])
    expect(barras[5].nombre).toBe('enero de 2027')
    expect(barras[4].nombre).toBe('diciembre de 2026')
  })

  it('n = 1 y n = 0', () => {
    expect(ultimosMeses(MOVS, '2027-01', 1).map((b) => b.mes)).toEqual(['2027-01'])
    expect(ultimosMeses(MOVS, '2027-01', 0)).toEqual([])
  })
})

describe('progresoMeta: casos límite', () => {
  // (ahorro / meta) * 100 en coma flotante: 0.29 * 100 = 28.999999999999996
  it.each([
    [2900, 10000, 29],
    [5700, 10000, 57],
    [5800, 10000, 58],
    [1, 3, 33],
    [2, 3, 66],
    [99_999_999_998, 99_999_999_999, 99],
  ])('ahorro %i de %i → %i por ciento', (ahorro, meta, porcentaje) => {
    expect(progresoMeta(ahorro, meta)?.porcentaje).toBe(porcentaje)
  })

  it('ahorro negativo: 0 % y falta la meta más lo que se debe', () => {
    expect(progresoMeta(-1, 100000)).toEqual({ porcentaje: 0, conseguida: false, faltan: 100001 })
    expect(progresoMeta(-99_999_999_999, 99_999_999_999)).toEqual({ porcentaje: 0, conseguida: false, faltan: 199_999_999_998 })
  })

  it('ahorro 0 y ahorro justo igual a la meta', () => {
    expect(progresoMeta(0, 5000)).toEqual({ porcentaje: 0, conseguida: false, faltan: 5000 })
    expect(progresoMeta(5000, 5000)).toEqual({ porcentaje: 100, conseguida: true, faltan: 0 })
    expect(progresoMeta(4999, 5000)).toEqual({ porcentaje: 99, conseguida: false, faltan: 1 })
  })

  it('meta no válida (negativa o sin definir) = sin meta', () => {
    expect(progresoMeta(100, -5)).toBeNull()
    expect(progresoMeta(100, undefined)).toBeNull()
  })

  it('el porcentaje siempre es entero', () => {
    for (let ahorro = 0; ahorro <= 10000; ahorro += 37) {
      const p = progresoMeta(ahorro, 10000)!.porcentaje
      expect(Number.isInteger(p)).toBe(true)
      expect(p).toBe(Math.floor((ahorro * 100) / 10000))
    }
  })
})

describe('resúmenes: importes con céntimos sueltos', () => {
  it('sumar muchos 0,10 da un número exacto de céntimos', () => {
    const muchos = Array.from({ length: 1000 }, () => mov('gasto', 10, '2026-11-13'))
    expect(resumir(muchos)).toEqual({ ingresos: 0, gastos: 10000, ahorro: -10000 })
  })
})

describe('parsearPrecio (precio de un cliente: 0 sí vale)', () => {
  it.each([['', 0], ['  ', 0], ['0', 0], ['0,00', 0], ['0.0', 0], ['0 €', 0], ['350', 35000], ['12,5', 1250]])('"%s" → %i', (texto, c) => {
    expect(parsearPrecio(texto)).toBe(c)
  })
  it('lo demás se valida como un importe', () => {
    expect(() => parsearPrecio('-5')).toThrow(ErrorDeValidacion)
    expect(() => parsearPrecio('gratis')).toThrow(ErrorDeValidacion)
  })
})
