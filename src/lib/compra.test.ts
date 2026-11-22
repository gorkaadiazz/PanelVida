import { describe, expect, it } from 'vitest'
import { agruparPorSeccion, nombreSeccion, normalizar, sugerencias, validarArticulo, yaPendiente, type ArticuloBasico } from './compra'

const art = (id: string, nombre: string, extra: Partial<ArticuloBasico> = {}): ArticuloBasico => ({
  id,
  nombre,
  cantidad: null,
  seccion: null,
  comprado: false,
  comprado_en: null,
  created_at: '2026-11-20T10:00:00Z',
  ...extra,
})

describe('validarArticulo', () => {
  it('limpia espacios y deja vacíos como null', () => {
    expect(validarArticulo({ nombre: '  Leche   entera ', cantidad: '  ', seccion: 'lacteos', notas: ' sin lactosa ' })).toEqual({
      nombre: 'Leche entera',
      cantidad: null,
      seccion: 'lacteos',
      notas: 'sin lactosa',
    })
  })

  it('una sección que no existe se queda sin sección', () => {
    expect(validarArticulo({ nombre: 'x', seccion: 'joyeria' }).seccion).toBeNull()
  })

  it('rechaza lo vacío y lo demasiado largo', () => {
    expect(() => validarArticulo({ nombre: '   ' })).toThrow('Escribe qué hay que comprar')
    expect(() => validarArticulo({ nombre: 'x'.repeat(81) })).toThrow('80')
    expect(() => validarArticulo({ nombre: 'x', cantidad: 'x'.repeat(31) })).toThrow('30')
    expect(() => validarArticulo({ nombre: 'x', notas: 'x'.repeat(301) })).toThrow('300')
    expect(validarArticulo({ nombre: '🍎'.repeat(80) }).nombre).toHaveLength(160) // 80 caracteres (emojis de 2 unidades)
  })
})

describe('normalizar', () => {
  it('sin tildes ni mayúsculas', () => {
    expect(normalizar('  Plátanos  de Canarias ')).toBe('platanos de canarias')
    expect(normalizar('ÑOQUIS')).toBe('noquis')
  })
})

describe('agruparPorSeccion', () => {
  it('pendientes por sección en el orden del súper, sin sección al final, y comprados aparte', () => {
    const { pendientes, comprados } = agruparPorSeccion([
      art('1', 'Lejía', { seccion: 'limpieza' }),
      art('2', 'Yogures', { seccion: 'lacteos' }),
      art('3', 'Pilas'),
      art('4', 'Manzanas', { seccion: 'fruta_verdura' }),
      art('5', 'Leche', { seccion: 'lacteos' }),
      art('6', 'Pan', { seccion: 'panaderia', comprado: true, comprado_en: '2026-11-21T10:00:00Z' }),
      art('7', 'Agua', { seccion: 'bebidas', comprado: true, comprado_en: '2026-11-22T10:00:00Z' }),
    ])
    expect(pendientes.map((g) => g.nombre)).toEqual(['Fruta y verdura', 'Lácteos y huevos', 'Limpieza', 'Sin sección'])
    expect(pendientes[1].articulos.map((a) => a.nombre)).toEqual(['Leche', 'Yogures'])
    expect(comprados.map((a) => a.nombre)).toEqual(['Agua', 'Pan'])
  })

  it('nombreSeccion', () => {
    expect(nombreSeccion('higiene')).toBe('Higiene')
    expect(nombreSeccion(null)).toBe('Sin sección')
  })
})

describe('sugerencias', () => {
  const f = (nombre: string, veces: number, ultima: string, seccion: string | null = null) => ({ nombre, veces, ultima, seccion })
  const frecuentes = [
    f('leche', 2, '2026-11-08T10:00:00Z', 'lacteos'),
    f('Lechuga', 1, '2026-11-02T10:00:00Z', 'fruta_verdura'),
    f('Pan de molde', 1, '2026-11-03T10:00:00Z', 'panaderia'),
    f('Pan', 2, '2026-11-05T10:00:00Z', 'panaderia'),
  ]

  it('lo más comprado primero', () => {
    expect(sugerencias('le', frecuentes, [])).toEqual([
      { nombre: 'leche', seccion: 'lacteos', veces: 2 },
      { nombre: 'Lechuga', seccion: 'fruta_verdura', veces: 1 },
    ])
  })

  it('busca también por palabras y sin tildes, y primero lo que empieza por lo escrito', () => {
    expect(sugerencias('MOLDE', frecuentes, []).map((s) => s.nombre)).toEqual(['Pan de molde'])
    expect(sugerencias('pa', frecuentes, []).map((s) => s.nombre)).toEqual(['Pan', 'Pan de molde'])
    expect(sugerencias('pa', frecuentes, [])[0].seccion).toBe('panaderia')
  })

  it('no sugiere lo que ya está pendiente ni exactamente lo escrito', () => {
    expect(sugerencias('le', frecuentes, [art('9', 'Leche')]).map((s) => s.nombre)).toEqual(['Lechuga'])
    expect(sugerencias('lechuga', frecuentes, []).map((s) => s.nombre)).toEqual([])
  })

  it('sin texto, lo más frecuente (en un empate, lo más reciente); y respeta el máximo', () => {
    expect(sugerencias('', frecuentes, [], 2).map((s) => s.nombre)).toEqual(['leche', 'Pan'])
  })

  it('junta los que solo se diferencian en tildes y se queda con el nombre más reciente', () => {
    const r = sugerencias('pl', [f('platano', 2, '2026-11-01T00:00:00Z'), f('Plátano', 1, '2026-11-09T00:00:00Z', 'fruta_verdura')], [])
    expect(r).toEqual([{ nombre: 'Plátano', seccion: 'fruta_verdura', veces: 3 }])
  })
})

describe('yaPendiente', () => {
  it('encuentra el mismo artículo pendiente aunque cambien tildes o mayúsculas', () => {
    const lista = [art('1', 'Plátanos'), art('2', 'Pan', { comprado: true, comprado_en: '2026-11-01T00:00:00Z' })]
    expect(yaPendiente('platanos', lista)?.id).toBe('1')
    expect(yaPendiente('pan', lista)).toBeUndefined()
  })
})
