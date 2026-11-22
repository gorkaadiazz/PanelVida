import { describe, expect, it } from 'vitest'
import { MARGEN_LATIDO_MS, comandoVincular, cuentaAtras, estadoPC, textoHace } from './agentes'

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

describe('estadoPC en los bordes', () => {
  const ahora = Date.parse('2026-03-29T01:30:00Z') // la noche del cambio de hora en Madrid
  it('justo en el margen (2,5 min) sigue encendido; 1 ms después, apagado', () => {
    expect(estadoPC(new Date(ahora - MARGEN_LATIDO_MS).toISOString(), ahora).encendido).toBe(true)
    expect(estadoPC(new Date(ahora - MARGEN_LATIDO_MS - 1).toISOString(), ahora)).toEqual({ encendido: false, texto: 'Apagado (visto hace 2 min)' })
  })
  it('latido en el futuro (reloj del servidor adelantado): encendido, nunca «hace -X»', () => {
    const r = estadoPC(new Date(ahora + 3_600_000).toISOString(), ahora)
    expect(r.encendido).toBe(true)
    expect(r.texto).not.toMatch(/-/)
  })
  it('fecha con zona horaria de Madrid: se compara el instante, no la hora local', () => {
    // 03:29 en Madrid (CEST, +02:00) = 01:29 UTC: hace 1 min
    expect(estadoPC('2026-03-29T03:29:00+02:00', ahora).encendido).toBe(true)
    expect(estadoPC('2026-03-29T01:59:00+01:00', ahora).texto).toBe('Apagado (visto hace 31 min)') // 00:59 UTC
  })
  it('valores vacíos o basura: «Aún no se ha conectado»', () => {
    for (const v of ['', 'ayer', 'null', '2026-13-45T00:00:00Z']) {
      expect(estadoPC(v, ahora)).toEqual({ encendido: false, texto: 'Aún no se ha conectado' })
    }
  })
  it('años después: en días', () => {
    expect(estadoPC('2025-03-29T01:30:00Z', ahora).texto).toBe('Apagado (visto hace 365 días)')
  })
})

describe('textoHace en los cambios de unidad', () => {
  it.each([
    [0, 'hace un momento'],
    [59_999, 'hace un momento'],
    [60_000, 'hace 1 min'],
    [3_599_999, 'hace 59 min'],
    [3_600_000, 'hace 1 h'],
    [86_399_999, 'hace 23 h'],
    [86_400_000, 'hace 1 día'],
    [2 * 86_400_000 - 1, 'hace 1 día'],
    [2 * 86_400_000, 'hace 2 días'],
  ])('%i ms → %s', (ms, texto) => {
    expect(textoHace(ms)).toBe(texto)
  })
})

describe('cuentaAtras en los bordes', () => {
  const ahora = Date.parse('2026-12-31T23:55:00Z')
  it('10 minutos justos, cambio de año y último segundo', () => {
    expect(cuentaAtras('2027-01-01T00:05:00Z', ahora)).toBe('10:00')
    expect(cuentaAtras('2026-12-31T23:55:00.001Z', ahora)).toBe('0:01')
    expect(cuentaAtras('2026-12-31T23:55:59.999Z', ahora)).toBe('1:00')
  })
  it('caducado justo ahora, fecha basura o vacía: null', () => {
    expect(cuentaAtras('2026-12-31T23:55:00Z', ahora)).toBeNull()
    expect(cuentaAtras('no es fecha', ahora)).toBeNull()
    expect(cuentaAtras('', ahora)).toBeNull()
  })
})

describe('comandoVincular con nombres hostiles para la shell', () => {
  // Dentro de comillas dobles, bash interpreta $ ` \ " y ! (historial, en una
  // terminal interactiva); fish, $ \ y ". Nada de eso puede quedar.
  const hostiles = [
    '$(rm -rf ~)',
    '`reboot`',
    '${HOME}',
    '"; rm -rf ~; echo "',
    '\\"; reboot; \\"',
    'PC!!',
    'PC !-1',
    '!rm',
    "PC'casa",
    'PC\ncasa; reboot',
    'PC\rreboot',
    'a\u001b[201~; reboot', // fin del pegado entre corchetes
    'PC\u0003\u000f',
    'PC‮hsab', // invierte cómo se ve el comando
    'PC​casa',
  ]
  it.each(hostiles)('%j', (nombre) => {
    const c = comandoVincular('ABCD-EFGH', nombre)
    const m = /^mipanel-agente vincular ABCD-EFGH(?: "([^"]*)")?$/.exec(c)
    expect(m).not.toBeNull()
    const dentro = m![1] ?? ''
    expect(dentro).not.toMatch(/[$`\\"!]/)
    expect(dentro).not.toMatch(/[\p{Cc}\p{Cf}]/u)
    expect(dentro).toBe(dentro.trim())
  })
  it('un nombre que solo tiene caracteres peligrosos: sin nombre', () => {
    expect(comandoVincular('ABCD-EFGH', '$`"\\!')).toBe('mipanel-agente vincular ABCD-EFGH')
  })
  it('tildes, ñ, comillas simples y paréntesis se quedan (son inofensivos entre comillas dobles)', () => {
    expect(comandoVincular('ABCD-EFGH', "Portátil de Íñigo (l'aula)")).toBe(`mipanel-agente vincular ABCD-EFGH "Portátil de Íñigo (l'aula)"`)
  })
})
