// Casos límite (tester) del Mando del PC en la app: el borde de la caducidad
// (30 s, la pone el servidor) y textos.
import { describe, expect, it } from 'vitest'
import { CADUCIDAD_MS, CON_CONFIRMACION, NOMBRE_ACCION, describirComando, estadoVisible, volumenValido } from './mando'

const creada = Date.parse('2026-11-22T20:00:00Z')
const caduca_en = new Date(creada + CADUCIDAD_MS).toISOString()
const c = (estado: string, caduca = caduca_en) => ({ accion: 'play_pausa', valor: null, estado, mensaje: null, caduca_en: caduca })

describe('estadoVisible en el borde de la caducidad', () => {
  it('1 ms antes de caducar sigue enviada; justo en la hora y después, caducada', () => {
    expect(estadoVisible(c('pendiente'), creada + CADUCIDAD_MS - 1)).toBe('enviado')
    expect(estadoVisible(c('pendiente'), creada + CADUCIDAD_MS)).toBe('caducado')
    expect(estadoVisible(c('pendiente'), creada + CADUCIDAD_MS + 1)).toBe('caducado')
  })
  it('lee la hora tal como la manda Postgres (microsegundos y +00:00)', () => {
    const pg = '2026-11-22T20:00:30.123456+00:00'
    expect(estadoVisible(c('pendiente', pg), Date.parse('2026-11-22T20:00:30.122Z'))).toBe('enviado')
    expect(estadoVisible(c('pendiente', pg), Date.parse('2026-11-22T20:00:30.124Z'))).toBe('caducado')
    // Con otra zona: la misma hora
    expect(estadoVisible(c('pendiente', '2026-11-22T21:00:30+01:00'), Date.parse('2026-11-22T20:00:31Z'))).toBe('caducado')
  })
  it('una que ya cogió el PC no pasa a caducada aunque pase el plazo', () => {
    const tarde = creada + 10 * 60_000
    expect(estadoVisible(c('ejecutando'), tarde)).toBe('ejecutando')
    expect(estadoVisible(c('hecho'), tarde)).toBe('hecho')
    expect(estadoVisible(c('error'), tarde)).toBe('error')
    expect(estadoVisible(c('caducado'), creada)).toBe('caducado')
  })
  it('estados desconocidos o vacíos: error', () => {
    expect(estadoVisible(c(''), creada)).toBe('error')
    expect(estadoVisible(c('Pendiente'), creada)).toBe('error')
    expect(estadoVisible(c('toString'), creada)).toBe('error')
  })
  it('la caducidad de la app coincide con la del servidor (30 s)', () => {
    expect(CADUCIDAD_MS).toBe(30_000)
  })
})

describe('describirComando y volumenValido: límites', () => {
  it('volumen o app sin valor: el nombre de la acción', () => {
    expect(describirComando({ accion: 'volumen', valor: null })).toBe('Volumen')
    expect(describirComando({ accion: 'abrir_app', valor: '' })).toBe('Abrir')
    expect(describirComando({ accion: 'volumen', valor: '0' })).toBe('Volumen al 0 %')
    expect(describirComando({ accion: '__proto__', valor: null })).toBe('__proto__')
    expect(describirComando({ accion: 'toString', valor: null })).toBe('toString')
  })
  it('volumen: bordes y valores raros', () => {
    expect(volumenValido(0)).toBe('0')
    expect(volumenValido(100)).toBe('100')
    expect(volumenValido(99.5)).toBe('100')
    expect(volumenValido(-0)).toBe('0')
    expect(volumenValido(Number.POSITIVE_INFINITY)).toBeNull()
    // Lo que sale siempre lo acepta el check de la base de datos
    for (const v of [0, 0.4, 1, 49.5, 99.4, 100, 150, -5]) expect(volumenValido(v)).toMatch(/^(100|[1-9]?[0-9])$/)
  })
  it('apagar y reiniciar piden confirmación; suspender y bloquear no', () => {
    expect(CON_CONFIRMACION.has('apagar') && CON_CONFIRMACION.has('reiniciar')).toBe(true)
    expect(CON_CONFIRMACION.has('suspender') || CON_CONFIRMACION.has('bloquear')).toBe(false)
    expect(Object.keys(NOMBRE_ACCION)).toHaveLength(12)
  })
})
