import { describe, expect, it } from 'vitest'
import { deBase64url, esHora, HORAS, textoHora } from './recordatorios'

describe('recordatorios', () => {
  it('horas de 7:00 a 23:00', () => {
    expect(HORAS[0]).toBe(7)
    expect(HORAS.at(-1)).toBe(23)
    expect(textoHora(7)).toBe('07:00')
  })
  it('valida la hora', () => {
    expect(esHora(0)).toBe(true)
    expect(esHora(23)).toBe(true)
    expect(esHora(24)).toBe(false)
    expect(esHora(7.5)).toBe(false)
    expect(esHora('8')).toBe(false)
  })
  it('base64url a bytes', () => {
    expect([...deBase64url('AQID_w')]).toEqual([1, 2, 3, 255])
  })
})
