// Casos límite del hogar e invitaciones (tester, fase 9 sección 2).
import { describe, expect, it } from 'vitest'
import { esResultadoUnirse, formatearCodigo, mensajeUnirse, nombreDeMiembro, normalizarCodigo, ordenarMiembros, pareceCodigo, textoCaducaInvitacion } from './hogar'

describe('códigos: casos límite', () => {
  it('normalizarCodigo hace lo mismo que normalizar_codigo() del servidor', () => {
    // upper(regexp_replace(codigo, '[^A-Za-z0-9]', '', 'g'))
    expect(normalizarCodigo('')).toBe('')
    expect(normalizarCodigo('  ab\tcd\n-ef  ')).toBe('ABCDEF')
    expect(normalizarCodigo('ñandú-12')).toBe('AND12') // letras fuera de A-Z se quitan, como en el servidor
    expect(normalizarCodigo('ＡＢＣ')).toBe('') // anchura completa: tampoco son A-Z
  })

  it('pareceCodigo: exactamente 10 del alfabeto, en cualquier caja', () => {
    expect(pareceCodigo('abcde-fghjk')).toBe(true)
    expect(pareceCodigo('ABCDE-FGHJKL')).toBe(false) // 11
    expect(pareceCodigo('ABCDE-FGHJ')).toBe(false) // 9
    expect(pareceCodigo('ABCDE-FGHJl')).toBe(true) // l minúscula = L, que sí vale
    expect(pareceCodigo('ABCDE-FGHJo')).toBe(false) // O no está en el alfabeto
    expect(pareceCodigo('ABCDE-FGHJ1')).toBe(false)
    expect(pareceCodigo('22222-99999')).toBe(true)
    expect(pareceCodigo('')).toBe(false)
  })

  it('formatearCodigo: vacío, justo 5 y guion final', () => {
    expect(formatearCodigo('')).toBe('')
    expect(formatearCodigo('abcde')).toBe('ABCDE')
    expect(formatearCodigo('abcde-')).toBe('ABCDE')
    expect(formatearCodigo('a-b-c-d-e-f')).toBe('ABCDE-F')
  })
})

describe('resultado de unirse: casos límite', () => {
  it('solo acepta los 6 resultados conocidos', () => {
    for (const r of ['ok', 'invalido', 'caducado', 'usado', 'ya_en_hogar', 'demasiados_intentos']) expect(esResultadoUnirse(r)).toBe(true)
    for (const r of [null, undefined, 1, {}, 'OK', '', '__proto__', 'hasOwnProperty', 'constructor']) expect(esResultadoUnirse(r)).toBe(false)
  })
  it('cada fallo tiene su mensaje', () => {
    for (const r of ['invalido', 'caducado', 'usado', 'ya_en_hogar', 'demasiados_intentos'] as const) expect(mensajeUnirse(r)).toBeTruthy()
  })
})

describe('caducidad de la invitación: casos límite', () => {
  it('justo en el instante de caducar ya está caducado (como caduca_en <= now() del servidor)', () => {
    const t = Date.parse('2026-11-29T12:00:00Z')
    expect(textoCaducaInvitacion('2026-11-29T12:00:00Z', t)).toBe('Caducado')
    expect(textoCaducaInvitacion('2026-11-29T12:00:00Z', t - 1)).toBe('Caduca hoy')
  })

  it('fecha inválida: no dice nada', () => {
    expect(textoCaducaInvitacion('no es una fecha', Date.now())).toBe('')
  })

  it('«hoy» y «mañana» son días de Madrid, no tramos de 24 horas', () => {
    // 28/11 a las 23:30 en Madrid; caduca el 29/11 a las 11:00 en Madrid → mañana
    expect(textoCaducaInvitacion('2026-11-29T10:00:00Z', Date.parse('2026-11-28T22:30:00Z'))).toBe('Caduca mañana')
    // 28/11 a las 00:30 en Madrid; caduca el 29/11 a las 23:00 en Madrid → mañana (no «en 1 día»)
    expect(textoCaducaInvitacion('2026-11-29T22:00:00Z', Date.parse('2026-11-27T23:30:00Z'))).toBe('Caduca mañana')
    // Mismo día en Madrid aunque en UTC sea otro: 29/11 00:30 Madrid es 28/11 23:30 UTC
    expect(textoCaducaInvitacion('2026-11-29T22:00:00Z', Date.parse('2026-11-28T23:30:00Z'))).toBe('Caduca hoy')
  })

  it('recién creada (7 días justos) dice 7 días, también si en medio cambia la hora (horario de verano)', () => {
    expect(textoCaducaInvitacion('2026-11-29T12:00:00Z', Date.parse('2026-11-22T12:00:00Z'))).toBe('Caduca en 7 días')
    // 25/03/2027 → 01/04/2027 (el 28/03 se adelanta la hora)
    expect(textoCaducaInvitacion('2027-04-01T09:00:00Z', Date.parse('2027-03-25T10:00:00Z'))).toBe('Caduca en 7 días')
    // 28/10/2027 → 04/11/2027 (el 31/10 se retrasa)
    expect(textoCaducaInvitacion('2027-11-04T10:00:00Z', Date.parse('2027-10-28T09:00:00Z'))).toBe('Caduca en 7 días')
  })

  it('cambio de año', () => {
    expect(textoCaducaInvitacion('2027-01-01T10:00:00Z', Date.parse('2026-12-31T10:00:00Z'))).toBe('Caduca mañana')
    expect(textoCaducaInvitacion('2027-01-03T10:00:00Z', Date.parse('2026-12-27T10:00:00Z'))).toBe('Caduca en 7 días')
  })
})

describe('miembros: casos límite', () => {
  it('ordenarMiembros no cambia el array, ordena en español y funciona si el dueño no está', () => {
    const lista = [
      { user_id: '1', nombre: 'Óscar' },
      { user_id: '2', nombre: 'nuria' },
      { user_id: '3', nombre: 'Ñoño' },
      { user_id: '4', nombre: 'Ana' },
    ]
    const copia = structuredClone(lista)
    expect(ordenarMiembros(lista, 'nadie').map((m) => m.nombre)).toEqual(['Ana', 'nuria', 'Ñoño', 'Óscar'])
    expect(ordenarMiembros(lista, '1').map((m) => m.nombre)).toEqual(['Óscar', 'Ana', 'nuria', 'Ñoño'])
    expect(lista).toEqual(copia)
    expect(ordenarMiembros([], 'x')).toEqual([])
  })

  it('nombreDeMiembro: cadena vacía es como nadie; yo aunque no esté en la lista', () => {
    expect(nombreDeMiembro('', [], 'a')).toBeNull()
    expect(nombreDeMiembro('a', [], 'a')).toBe('ti')
  })
})
