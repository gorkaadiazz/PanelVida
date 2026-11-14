import { describe, expect, it } from 'vitest'
import { enlaceSeguro, ErrorDeValidacion, historial, ordenarDeseos, repartirAhorro, validarDeseo } from './deseos'

const base = { articulo: 'Auriculares', precio: '59,99', prioridad: 'media', enlace: '', notas: '' }

describe('validar', () => {
  it('limpia y pasa el precio a céntimos', () => {
    expect(validarDeseo({ ...base, articulo: '  Auriculares   buenos ' })).toEqual({
      articulo: 'Auriculares buenos', precio_centimos: 5999, prioridad: 'media', enlace: null, notas: '',
    })
  })
  it('enlace: acepta http(s) y añade https:// si falta', () => {
    expect(validarDeseo({ ...base, enlace: 'https://tienda.es/x?y=1' }).enlace).toBe('https://tienda.es/x?y=1')
    expect(validarDeseo({ ...base, enlace: 'amazon.es/dp/123' }).enlace).toBe('https://amazon.es/dp/123')
  })
  it.each([
    [{ articulo: ' ' }],
    [{ articulo: 'x'.repeat(121) }],
    [{ precio: '0' }],
    [{ precio: '' }],
    [{ precio: 'caro' }],
    [{ prioridad: 'urgente' }],
    [{ enlace: 'javascript:alert(1)' }],
    [{ enlace: 'data:text/html,hola' }],
    [{ enlace: 'ftp://tienda.es' }],
    [{ enlace: 'https://con espacios.es' }],
    [{ notas: 'x'.repeat(1001) }],
  ])('rechaza %j', (cambios) => {
    expect(() => validarDeseo({ ...base, ...cambios })).toThrow(ErrorDeValidacion)
  })
  it('enlaceSeguro no deja pasar nada que no sea http(s)', () => {
    expect(enlaceSeguro('JavaScript:alert(1)')).toBeNull()
    expect(enlaceSeguro(' javascript:alert(1)')).toBeNull()
    expect(enlaceSeguro('https://ok.es')).toBe('https://ok.es')
    expect(enlaceSeguro(null)).toBeNull()
  })
})

const d = (id: string, precio: number, prioridad: string, created_at = '2026-11-01T00:00:00Z', comprado = false) => ({
  id, articulo: id, precio_centimos: precio, prioridad, comprado, created_at, comprado_en: comprado ? '2026-11-10' : null,
})

describe('reparto del ahorro', () => {
  const deseos = [
    d('baja', 1000, 'baja'),
    d('media nueva', 3000, 'media', '2026-11-10T00:00:00Z'),
    d('alta', 6000, 'alta'),
    d('media vieja', 2000, 'media', '2026-10-01T00:00:00Z'),
    d('comprado', 500, 'alta', '2026-11-01T00:00:00Z', true),
  ]
  it('ordena por prioridad y antigüedad, sin los comprados', () => {
    expect(ordenarDeseos(deseos).map((x) => x.id)).toEqual(['alta', 'media vieja', 'media nueva', 'baja'])
  })
  it('el ahorro llega primero a lo más prioritario', () => {
    const r = repartirAhorro(deseos, 9000)
    expect(r.map((x) => [x.deseo.id, x.teLlega, x.falta, x.porcentaje])).toEqual([
      ['alta', true, 0, 100],
      ['media vieja', true, 0, 100],
      ['media nueva', false, 2000, 33],
      ['baja', false, 1000, 0],
    ])
  })
  it('con ahorro negativo o cero, falta todo', () => {
    expect(repartirAhorro(deseos, -500).every((x) => x.falta === x.deseo.precio_centimos && x.porcentaje === 0)).toBe(true)
  })
  it('con ahorro de sobra, a todos les llega', () => {
    expect(repartirAhorro(deseos, 1_000_000).every((x) => x.teLlega)).toBe(true)
  })
  it('historial: comprados, el más reciente primero', () => {
    expect(historial([...deseos, { ...d('otro', 1, 'baja', '2026-11-01T00:00:00Z', true), comprado_en: '2026-11-12' }]).map((x) => x.id)).toEqual(['otro', 'comprado'])
  })
})
