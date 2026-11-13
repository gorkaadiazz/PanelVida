import { describe, expect, it } from 'vitest'
import {
  clientesDe,
  ErrorDeValidacion,
  estadoVecino,
  ordenAlFinal,
  resumenNegocio,
  validarEstado,
  validarNombreCliente,
  validarNotas,
  type ClienteBasico,
} from './negocio'

let n = 0
const cliente = (estado: string, precio_centimos = 0, cambios: Partial<ClienteBasico> = {}): ClienteBasico => ({
  id: `c${++n}`,
  nombre: `Cliente ${n}`,
  precio_centimos,
  estado,
  orden: 0,
  created_at: `2026-11-${String(n).padStart(2, '0')}T10:00:00Z`,
  ...cambios,
})

describe('resumenNegocio', () => {
  it('cuenta por estado, facturado (entregados) y en curso', () => {
    const r = resumenNegocio([
      cliente('contacto', 30000),
      cliente('propuesta', 45000),
      cliente('en_curso', 60000),
      cliente('en_curso', 25050),
      cliente('entregado', 80000),
      cliente('entregado', 0),
      cliente('inventado', 99999),
    ])
    expect(r.porEstado).toEqual({ contacto: 1, propuesta: 1, en_curso: 2, entregado: 2 })
    expect(r.facturado).toBe(80000)
    expect(r.enCurso).toBe(85050)
  })

  it('sin clientes, todo a cero', () => {
    expect(resumenNegocio([])).toEqual({ porEstado: { contacto: 0, propuesta: 0, en_curso: 0, entregado: 0 }, facturado: 0, enCurso: 0 })
  })
})

describe('estados', () => {
  it('camino Contacto → Propuesta → En curso → Entregado', () => {
    expect(estadoVecino('contacto', 1)).toBe('propuesta')
    expect(estadoVecino('en_curso', 1)).toBe('entregado')
    expect(estadoVecino('entregado', 1)).toBeNull()
    expect(estadoVecino('contacto', -1)).toBeNull()
    expect(estadoVecino('propuesta', -1)).toBe('contacto')
  })

  it('valida el estado', () => {
    expect(validarEstado('en_curso')).toBe('en_curso')
    expect(() => validarEstado('cobrado')).toThrow(ErrorDeValidacion)
  })
})

describe('orden dentro de un estado', () => {
  it('por orden y, a igual orden, el más antiguo primero', () => {
    const a = cliente('contacto', 0, { orden: 1 })
    const b = cliente('contacto', 0, { orden: 0 })
    const c = cliente('contacto', 0, { orden: 1 })
    const d = cliente('propuesta')
    expect(clientesDe([a, b, c, d], 'contacto').map((x) => x.id)).toEqual([b.id, a.id, c.id])
  })

  it('un cliente que entra en un estado va al final', () => {
    const lista = [cliente('contacto', 0, { orden: 3 }), cliente('propuesta', 0, { orden: 9 })]
    expect(ordenAlFinal(lista, 'contacto')).toBe(4)
    expect(ordenAlFinal(lista, 'en_curso')).toBe(0)
  })
})

describe('validación', () => {
  it('nombre y notas', () => {
    expect(validarNombreCliente('  Bar  Pepe ')).toBe('Bar Pepe')
    expect(() => validarNombreCliente('')).toThrow(ErrorDeValidacion)
    expect(() => validarNombreCliente('x'.repeat(121))).toThrow(ErrorDeValidacion)
    expect(validarNotas('  Quiere tienda online\n')).toBe('Quiere tienda online')
    expect(() => validarNotas('x'.repeat(2001))).toThrow(ErrorDeValidacion)
  })
})

// ---------------------------------------------------------------------------
// Casos límite añadidos por el tester (fase 5)
// ---------------------------------------------------------------------------

describe('estados: casos límite', () => {
  it('el camino completo hacia delante y hacia atrás recorre los 4 estados sin saltarse ninguno', () => {
    const adelante: string[] = ['contacto']
    let e: ReturnType<typeof estadoVecino> = 'contacto'
    while ((e = estadoVecino(e, 1))) adelante.push(e)
    expect(adelante).toEqual(['contacto', 'propuesta', 'en_curso', 'entregado'])

    const atras: string[] = ['entregado']
    e = 'entregado'
    while ((e = estadoVecino(e, -1))) atras.push(e)
    expect(atras).toEqual([...adelante].reverse())
  })

  it.each(['', 'Contacto', 'EN_CURSO', 'en curso', ' entregado', 'toString', '__proto__'])('rechaza el estado "%s"', (estado) => {
    expect(() => validarEstado(estado)).toThrow(ErrorDeValidacion)
  })
})

describe('resumenNegocio: casos límite', () => {
  it('importes con céntimos sueltos suman exactos (sin coma flotante)', () => {
    const r = resumenNegocio([cliente('entregado', 10), cliente('entregado', 20), cliente('en_curso', 1), cliente('en_curso', 2)])
    expect(r.facturado).toBe(30)
    expect(r.enCurso).toBe(3)
  })

  it('contacto y propuesta cuentan pero no suman dinero', () => {
    const r = resumenNegocio([cliente('contacto', 99_999_999_999), cliente('propuesta', 50000)])
    expect(r).toEqual({ porEstado: { contacto: 1, propuesta: 1, en_curso: 0, entregado: 0 }, facturado: 0, enCurso: 0 })
  })

  it('muchos entregados al precio máximo siguen siendo un entero exacto', () => {
    const lista = Array.from({ length: 50 }, () => cliente('entregado', 99_999_999_999))
    const r = resumenNegocio(lista)
    expect(r.facturado).toBe(50 * 99_999_999_999)
    expect(Number.isSafeInteger(r.facturado)).toBe(true)
  })

  it('un estado desconocido (p. ej. de una versión futura) no se cuenta ni suma', () => {
    const r = resumenNegocio([cliente('cobrado', 1000), cliente('ENTREGADO', 1000)])
    expect(r.facturado).toBe(0)
    expect(Object.values(r.porEstado).reduce((a, b) => a + b, 0)).toBe(0)
  })
})

describe('orden dentro de un estado: casos límite', () => {
  it('estado vacío → 0; con órdenes negativos o con huecos, siempre detrás del mayor', () => {
    expect(ordenAlFinal([], 'contacto')).toBe(0)
    expect(ordenAlFinal([cliente('contacto', 0, { orden: -5 })], 'contacto')).toBe(0)
    expect(ordenAlFinal([cliente('contacto', 0, { orden: 2 }), cliente('contacto', 0, { orden: 40 })], 'contacto')).toBe(41)
  })

  it('a igual orden y misma fecha de alta, desempata el id (orden estable entre dispositivos)', () => {
    const fecha = '2026-11-13T10:00:00Z'
    const b = cliente('contacto', 0, { id: 'b', created_at: fecha })
    const a = cliente('contacto', 0, { id: 'a', created_at: fecha })
    expect(clientesDe([b, a], 'contacto').map((x) => x.id)).toEqual(['a', 'b'])
    expect(clientesDe([a, b], 'contacto').map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('clientesDe no modifica la lista original', () => {
    const lista = [cliente('contacto', 0, { orden: 2 }), cliente('contacto', 0, { orden: 1 })]
    const ids = lista.map((c) => c.id)
    clientesDe(lista, 'contacto')
    expect(lista.map((c) => c.id)).toEqual(ids)
  })
})

describe('validación: límites exactos', () => {
  it('nombre de 120 y notas de 2000 caracteres valen; uno más, no', () => {
    expect(validarNombreCliente('x'.repeat(120))).toHaveLength(120)
    expect(validarNotas('x'.repeat(2000))).toHaveLength(2000)
    // Los espacios de los extremos no cuentan
    expect(validarNotas(` ${'x'.repeat(2000)} `)).toHaveLength(2000)
  })

  it('las notas conservan los saltos de línea de dentro; el nombre los convierte en un espacio', () => {
    expect(validarNotas('Línea 1\nLínea 2')).toBe('Línea 1\nLínea 2')
    expect(validarNombreCliente('Bar\nPepe')).toBe('Bar Pepe')
    expect(validarNotas('   ')).toBe('')
  })
})
