import { describe, expect, it } from 'vitest'
import { ErrorDeValidacion, ideasArchivadas, ideasSinProcesar, notasDeIdea, TEXTO_IDEA_MAX, tituloDeIdea, validarIdea } from './ideas'

describe('validar una idea', () => {
  it('limpia espacios y respeta los saltos de línea', () => {
    expect(validarIdea('  ir   al\tcine  ')).toBe('ir al cine')
    expect(validarIdea('Viaje a Asturias\n\n\n\n  en verano ')).toBe('Viaje a Asturias\n\nen verano')
  })
  it.each(['', '   ', '\n\n'])('rechaza una idea vacía (%j)', (t) => {
    expect(() => validarIdea(t)).toThrow(ErrorDeValidacion)
  })
  it('acepta hasta el máximo y rechaza uno más', () => {
    expect(validarIdea('x'.repeat(TEXTO_IDEA_MAX))).toHaveLength(TEXTO_IDEA_MAX)
    expect(() => validarIdea('x'.repeat(TEXTO_IDEA_MAX + 1))).toThrow(ErrorDeValidacion)
  })
})

describe('bandeja', () => {
  const ideas = [
    { id: 'a', texto: 'vieja', archivada: false, created_at: '2026-11-10T10:00:00Z' },
    { id: 'b', texto: 'nueva', archivada: false, created_at: '2026-11-14T10:00:00Z' },
    { id: 'c', texto: 'archivada', archivada: true, created_at: '2026-11-12T10:00:00Z' },
  ]
  it('sin procesar, la más reciente primero; archivadas aparte', () => {
    expect(ideasSinProcesar(ideas).map((i) => i.id)).toEqual(['b', 'a'])
    expect(ideasArchivadas(ideas).map((i) => i.id)).toEqual(['c'])
  })
})

describe('convertir', () => {
  it('el título es la primera línea (recortada) y las notas, el resto', () => {
    expect(tituloDeIdea('Cena en el japonés\ncon Ana y Leo', 120)).toBe('Cena en el japonés')
    expect(notasDeIdea('Cena en el japonés\ncon Ana y Leo')).toBe('con Ana y Leo')
    expect(tituloDeIdea('abcdefghij', 5)).toBe('abcd…')
    expect(tituloDeIdea('abcde', 5)).toBe('abcde')
    expect(notasDeIdea('solo una línea')).toBe('')
  })
})
