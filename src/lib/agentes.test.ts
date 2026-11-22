import { describe, expect, it } from 'vitest'
import { comandoVincular, cuentaAtras, estadoPC, textoHace } from './agentes'

describe('estadoPC', () => {
  const ahora = Date.parse('2026-11-22T18:00:00Z')
  it('encendido si ha latido hace poco', () => {
    expect(estadoPC('2026-11-22T17:59:10Z', ahora)).toEqual({ encendido: true, texto: 'Encendido' })
    expect(estadoPC('2026-11-22T17:57:30Z', ahora).encendido).toBe(true)
    expect(estadoPC('2026-11-22T18:00:30Z', ahora).encendido).toBe(true) // reloj del servidor adelantado
  })
  it('apagado con cuánto hace', () => {
    expect(estadoPC('2026-11-22T17:55:00Z', ahora)).toEqual({ encendido: false, texto: 'Apagado (visto hace 5 min)' })
    expect(estadoPC('2026-11-22T14:00:00Z', ahora).texto).toBe('Apagado (visto hace 4 h)')
    expect(estadoPC('2026-11-20T17:00:00Z', ahora).texto).toBe('Apagado (visto hace 2 días)')
    expect(estadoPC(null, ahora)).toEqual({ encendido: false, texto: 'Aún no se ha conectado' })
  })
  it('textoHace', () => {
    expect(textoHace(30_000)).toBe('hace un momento')
    expect(textoHace(86_400_000)).toBe('hace 1 día')
  })
})

describe('vincular', () => {
  it('comando para pegar en el PC, sin nada que la shell pueda interpretar en el nombre', () => {
    expect(comandoVincular('ABCD-EFGH', 'PC casa')).toBe('mipanel-agente vincular ABCD-EFGH "PC casa"')
    expect(comandoVincular('ABCD-EFGH', '$(rm -rf ~) `x` "y"')).toBe('mipanel-agente vincular ABCD-EFGH "(rm -rf ~) x y"')
    expect(comandoVincular('ABCD-EFGH', '  ')).toBe('mipanel-agente vincular ABCD-EFGH')
  })
  it('cuenta atrás del código', () => {
    const ahora = Date.parse('2026-11-22T18:00:00Z')
    expect(cuentaAtras('2026-11-22T18:09:41Z', ahora)).toBe('9:41')
    expect(cuentaAtras('2026-11-22T18:00:00.500Z', ahora)).toBe('0:01')
    expect(cuentaAtras('2026-11-22T17:59:00Z', ahora)).toBeNull()
  })
})
