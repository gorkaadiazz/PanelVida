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
