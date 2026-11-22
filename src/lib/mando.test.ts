import { describe, expect, it } from 'vitest'
import { describirComando, estadoVisible, volumenValido } from './mando'

describe('estadoVisible', () => {
  const ahora = Date.parse('2026-11-22T20:00:00Z')
  const c = (estado: string, caduca_en = '2026-11-22T20:00:20Z') => ({ accion: 'bloquear', valor: null, estado, mensaje: null, caduca_en })
  it('pendiente: enviado o, pasado el plazo, caducado', () => {
    expect(estadoVisible(c('pendiente'), ahora)).toBe('enviado')
    expect(estadoVisible(c('pendiente', '2026-11-22T19:59:59Z'), ahora)).toBe('caducado')
    expect(estadoVisible(c('pendiente', '2026-11-22T20:00:00Z'), ahora)).toBe('caducado')
  })
  it('el resto tal cual; lo desconocido, error', () => {
    expect(estadoVisible(c('hecho'), ahora)).toBe('hecho')
    expect(estadoVisible(c('ejecutando'), ahora)).toBe('ejecutando')
    expect(estadoVisible(c('raro'), ahora)).toBe('error')
  })
})

describe('describirComando', () => {
  it('textos', () => {
    expect(describirComando({ accion: 'volumen', valor: '40' })).toBe('Volumen al 40 %')
    expect(describirComando({ accion: 'abrir_app', valor: 'Firefox' })).toBe('Abrir Firefox')
    expect(describirComando({ accion: 'apagar', valor: null })).toBe('Apagar')
    expect(describirComando({ accion: 'otra', valor: null })).toBe('otra')
  })
})

describe('volumenValido', () => {
  it('entero de 0 a 100', () => {
    expect(volumenValido(40.6)).toBe('41')
    expect(volumenValido(-3)).toBe('0')
    expect(volumenValido(180)).toBe('100')
    expect(volumenValido(Number.NaN)).toBeNull()
  })
})
