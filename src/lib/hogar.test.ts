import { describe, expect, it } from 'vitest'
import { esResultadoUnirse, formatearCodigo, mensajeUnirse, nombreDeMiembro, normalizarCodigo, ordenarMiembros, pareceCodigo, textoCaducaInvitacion } from './hogar'

describe('códigos', () => {
  it('normaliza como el servidor', () => {
    expect(normalizarCodigo(' abcde-fghjk ')).toBe('ABCDEFGHJK')
    expect(normalizarCodigo('ab cd_ef')).toBe('ABCDEF')
  })
  it('reconoce un código bien formado (sin I, O, 0 ni 1)', () => {
    expect(pareceCodigo('ABCDE-FGHJK')).toBe(true)
    expect(pareceCodigo('abcde fghjk')).toBe(true)
    expect(pareceCodigo('ABCDE-FGHJI')).toBe(false)
    expect(pareceCodigo('ABCDE-FGH0K')).toBe(false)
    expect(pareceCodigo('ABCDE')).toBe(false)
  })
  it('pone el guion mientras se escribe y corta en 10', () => {
    expect(formatearCodigo('abc')).toBe('ABC')
    expect(formatearCodigo('abcdef')).toBe('ABCDE-F')
    expect(formatearCodigo('ABCDE-FGHJKLMN')).toBe('ABCDE-FGHJK')
  })
})

describe('resultado de unirse', () => {
  it('mensajes', () => {
    expect(mensajeUnirse('ok')).toBeNull()
    expect(mensajeUnirse('caducado')).toMatch(/caducado/)
    expect(mensajeUnirse('demasiados_intentos')).toMatch(/una hora/)
    expect(esResultadoUnirse('usado')).toBe(true)
    expect(esResultadoUnirse('hola')).toBe(false)
    expect(esResultadoUnirse('toString')).toBe(false)
  })
})

describe('caducidad de la invitación', () => {
  const ahora = Date.parse('2026-11-22T12:00:00Z')
  it('días que quedan', () => {
    expect(textoCaducaInvitacion('2026-11-29T12:00:00Z', ahora)).toBe('Caduca en 7 días')
    expect(textoCaducaInvitacion('2026-11-23T13:00:00Z', ahora)).toBe('Caduca mañana')
    expect(textoCaducaInvitacion('2026-11-22T20:00:00Z', ahora)).toBe('Caduca hoy')
    expect(textoCaducaInvitacion('2026-11-22T11:00:00Z', ahora)).toBe('Caducado')
  })
})

describe('miembros', () => {
  const miembros = [
    { user_id: 'b', nombre: 'Zoe' },
    { user_id: 'a', nombre: 'Yo dueño' },
    { user_id: 'c', nombre: 'Ana' },
  ]
  it('el dueño primero', () => {
    expect(ordenarMiembros(miembros, 'a').map((m) => m.nombre)).toEqual(['Yo dueño', 'Ana', 'Zoe'])
  })
  it('quién lo marcó', () => {
    expect(nombreDeMiembro('c', miembros, 'a')).toBe('Ana')
    expect(nombreDeMiembro('a', miembros, 'a')).toBe('ti')
    expect(nombreDeMiembro('x', miembros, 'a')).toBe('alguien que ya no está en el hogar')
    expect(nombreDeMiembro(null, miembros, 'a')).toBeNull()
  })
})
