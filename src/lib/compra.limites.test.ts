// Casos límite de la Lista de la compra (tester, fase 9 sección 2).
import { describe, expect, it } from 'vitest'
import { SECCIONES, agruparPorSeccion, esSeccion, normalizar, sugerencias, validarArticulo, yaPendiente, type ArticuloBasico, type Frecuente } from './compra'

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
const f = (nombre: string, veces: number, ultima: string, seccion: string | null = null): Frecuente => ({ nombre, veces, ultima, seccion })

describe('validarArticulo: emojis y caracteres raros', () => {
  it('cuenta caracteres, no unidades UTF-16: 80 emojis entran y 81 no (igual que length() de Postgres)', () => {
    expect(validarArticulo({ nombre: '🥖'.repeat(80) }).nombre).toBe('🥖'.repeat(80))
    expect(() => validarArticulo({ nombre: '🥖'.repeat(81) })).toThrow('80')
    expect(validarArticulo({ nombre: 'x', cantidad: '🥚'.repeat(30) }).cantidad).toBe('🥚'.repeat(30))
    expect(() => validarArticulo({ nombre: 'x', cantidad: '🥚'.repeat(31) })).toThrow('30')
    expect(validarArticulo({ nombre: 'x', notas: '🧀'.repeat(300) }).notas).toBe('🧀'.repeat(300))
    expect(() => validarArticulo({ nombre: 'x', notas: '🧀'.repeat(301) })).toThrow('300')
  })

  it('no rompe los emojis compuestos (unidos con ZWJ, con tono de piel o selector de variante)', () => {
    for (const e of ['👨‍👩‍👧', '🧑‍🍳', '🐻‍❄️', '👍🏽', '❤️', '🇪🇸', '🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}', '👩🏽‍💻']) {
      expect(validarArticulo({ nombre: `Regalo ${e}` }).nombre).toBe(`Regalo ${e}`)
      expect(validarArticulo({ nombre: 'x', notas: `con ${e}` }).notas).toBe(`con ${e}`)
    }
  })

  it('quita los caracteres invisibles y de control (también un ZWJ suelto) y no deja un nombre invisible', () => {
    expect(validarArticulo({ nombre: '‮ovleuh' }).nombre).toBe('ovleuh') // inversión de texto
    expect(validarArticulo({ nombre: 'Pa​n\u0000' }).nombre).toBe('Pan')
    expect(validarArticulo({ nombre: 'Pan‍' }).nombre).toBe('Pan')
    expect(() => validarArticulo({ nombre: '​‍﻿' })).toThrow('Escribe qué hay que comprar')
    expect(() => validarArticulo({ nombre: '\n\t ' })).toThrow('Escribe qué hay que comprar')
    expect(validarArticulo({ nombre: 'Leche\n\tentera' }).nombre).toBe('Leche entera')
  })

  it('las notas conservan los saltos de línea pero no los \\r ni los tabuladores', () => {
    expect(validarArticulo({ nombre: 'x', notas: ' uno\r\ndos\t \n' }).notas).toBe('uno\ndos')
  })

  it('cantidad y sección vacías o inventadas se quedan en null (el servidor no acepta cadena vacía)', () => {
    const r = validarArticulo({ nombre: 'x', cantidad: ' ​ ', seccion: '' })
    expect(r.cantidad).toBeNull()
    expect(r.seccion).toBeNull()
    expect(validarArticulo({ nombre: 'x', seccion: 'toString' }).seccion).toBeNull()
    expect(validarArticulo({ nombre: 'x', seccion: 'LACTEOS' }).seccion).toBeNull()
    expect(validarArticulo({ nombre: 'x', seccion: '__proto__' }).seccion).toBeNull()
  })

  it('los límites se miden después de limpiar', () => {
    expect(validarArticulo({ nombre: `  ${'a'.repeat(80)}   ` }).nombre).toHaveLength(80)
    expect(validarArticulo({ nombre: 'a'.repeat(40) + '​'.repeat(50) + 'a'.repeat(40) }).nombre).toHaveLength(80)
  })
})

describe('secciones', () => {
  it('son las 10 del check de la base de datos, sin repetir', () => {
    expect(SECCIONES.map((s) => s.clave)).toEqual([
      'fruta_verdura',
      'carne_pescado',
      'lacteos',
      'panaderia',
      'despensa',
      'congelados',
      'bebidas',
      'limpieza',
      'higiene',
      'otros',
    ])
    expect(esSeccion(null)).toBe(false)
    expect(esSeccion(undefined)).toBe(false)
  })
})

describe('normalizar', () => {
  it('tildes, diéresis, eñes, mayúsculas y espacios raros', () => {
    expect(normalizar('Pingüino')).toBe('pinguino')
    expect(normalizar('AÑO')).toBe('ano')
    expect(normalizar('Pan de molde')).toBe('pan de molde')
    expect(normalizar('🍎 Manzanas')).toBe('🍎 manzanas')
    expect(normalizar('')).toBe('')
  })
})

describe('agruparPorSeccion: casos límite', () => {
  it('lista vacía', () => {
    expect(agruparPorSeccion([])).toEqual({ pendientes: [], comprados: [] })
  })

  it('todo comprado: no hay grupos de pendientes', () => {
    const r = agruparPorSeccion([art('1', 'Pan', { comprado: true, comprado_en: '2026-11-22T10:00:00Z', seccion: 'panaderia' })])
    expect(r.pendientes).toEqual([])
    expect(r.comprados).toHaveLength(1)
  })

  it('una sección desconocida (p. ej. de una versión futura) va a «Sin sección», junto a las que no tienen', () => {
    const r = agruparPorSeccion([art('1', 'Pilas'), art('2', 'Anillo', { seccion: 'joyeria' }), art('3', 'Lejía', { seccion: 'limpieza' })])
    expect(r.pendientes.map((g) => [g.seccion, g.nombre, g.articulos.map((a) => a.nombre)])).toEqual([
      ['limpieza', 'Limpieza', ['Lejía']],
      [null, 'Sin sección', ['Anillo', 'Pilas']],
    ])
  })

  it('ordena como en español (mayúsculas, tildes y la ñ) y en empate por id', () => {
    const r = agruparPorSeccion([art('b', 'ñame'), art('c', 'Nabo'), art('d', 'oca'), art('a', 'Ábaco'), art('z', 'pan'), art('y', 'pan')])
    expect(r.pendientes[0].articulos.map((a) => `${a.nombre}:${a.id}`)).toEqual(['Ábaco:a', 'Nabo:c', 'ñame:b', 'oca:d', 'pan:y', 'pan:z'])
  })

  it('comprados: lo último que se marcó primero y los que no tienen fecha al final', () => {
    const r = agruparPorSeccion([
      art('1', 'Viejo', { comprado: true, comprado_en: '2026-11-01T10:00:00Z' }),
      art('2', 'Sin fecha', { comprado: true, comprado_en: null }),
      art('3', 'Nuevo', { comprado: true, comprado_en: '2026-11-22T10:00:00Z' }),
    ])
    expect(r.comprados.map((a) => a.nombre)).toEqual(['Nuevo', 'Viejo', 'Sin fecha'])
  })

  it('no cambia el array que recibe', () => {
    const lista = [art('2', 'B', { seccion: 'otros' }), art('1', 'A', { seccion: 'lacteos' })]
    const copia = structuredClone(lista)
    agruparPorSeccion(lista)
    expect(lista).toEqual(copia)
  })
})

describe('sugerencias: casos límite', () => {
  const frecuentes = [
    f('Leche', 5, '2026-11-10T10:00:00Z', 'lacteos'),
    f('Pan de molde', 3, '2026-11-09T10:00:00Z', 'panaderia'),
    f('Plátanos', 2, '2026-11-08T10:00:00Z', 'fruta_verdura'),
    f('Detergente', 1, '2026-11-07T10:00:00Z', 'limpieza'),
  ]

  it('sin frecuentes o con máximo 0 no sugiere nada', () => {
    expect(sugerencias('le', [], [])).toEqual([])
    expect(sugerencias('le', frecuentes, [], 0)).toEqual([])
  })

  it('solo espacios cuenta como no haber escrito nada', () => {
    expect(sugerencias('   ', frecuentes, [], 2).map((s) => s.nombre)).toEqual(['Leche', 'Pan de molde'])
  })

  it('lo escrito con o sin tildes encuentra lo mismo', () => {
    expect(sugerencias('PLA', frecuentes, []).map((s) => s.nombre)).toEqual(['Plátanos'])
    expect(sugerencias('plá', frecuentes, []).map((s) => s.nombre)).toEqual(['Plátanos'])
  })

  it('lo que empieza por lo escrito va antes que lo que solo tiene una palabra que empieza así, aunque se compre menos', () => {
    // «de»: Detergente empieza por «de» (1 vez); Pan de molde solo tiene la palabra «de» (3 veces)
    expect(sugerencias('de', frecuentes, []).map((s) => s.nombre)).toEqual(['Detergente', 'Pan de molde'])
  })

  it('espacios de más en lo escrito no impiden encontrarlo', () => {
    expect(sugerencias('  pan   de ', frecuentes, []).map((s) => s.nombre)).toEqual(['Pan de molde'])
  })

  it('no busca por trozos del medio de una palabra', () => {
    expect(sugerencias('che', frecuentes, [])).toEqual([])
  })

  it('lo comprado (ya no pendiente) se vuelve a sugerir; lo pendiente no, aunque cambien las tildes', () => {
    const lista = [art('1', 'leche', { comprado: true, comprado_en: '2026-11-22T10:00:00Z' }), art('2', 'PLATANOS')]
    expect(sugerencias('', frecuentes, lista).map((s) => s.nombre)).toEqual(['Leche', 'Pan de molde', 'Detergente'])
  })

  it('ignora frecuentes sin nombre y una sección desconocida se queda en null', () => {
    const r = sugerencias('', [f('   ', 99, '2026-11-22T00:00:00Z'), f('​', 50, '2026-11-22T00:00:00Z'), f('Pilas', 1, '2026-11-01T00:00:00Z', 'joyeria')], [])
    expect(r).toEqual([{ nombre: 'Pilas', seccion: null, veces: 1 }])
  })

  it('al juntar duplicados, si el más reciente no tiene sección se queda la del otro', () => {
    const r = sugerencias('ac', [f('Aceite', 2, '2026-11-01T00:00:00Z', 'despensa'), f('aceite', 1, '2026-11-05T00:00:00Z')], [])
    expect(r).toEqual([{ nombre: 'aceite', seccion: 'despensa', veces: 3 }])
  })

  it('en empate de veces y fecha, por orden alfabético (resultado estable)', () => {
    const r = sugerencias('', [f('Zumo', 1, '2026-11-01T00:00:00Z'), f('Agua', 1, '2026-11-01T00:00:00Z')], [])
    expect(r.map((s) => s.nombre)).toEqual(['Agua', 'Zumo'])
  })

  it('no cambia los frecuentes que recibe', () => {
    const lista = [f('a', 1, '2026-11-01T00:00:00Z'), f('A', 2, '2026-11-02T00:00:00Z')]
    const copia = structuredClone(lista)
    sugerencias('a', lista, [])
    sugerencias('', lista, [])
    expect(lista).toEqual(copia)
  })

  it('con emojis', () => {
    expect(sugerencias('🍎', [f('🍎 Manzanas', 1, '2026-11-01T00:00:00Z')], []).map((s) => s.nombre)).toEqual(['🍎 Manzanas'])
  })
})

describe('yaPendiente: casos límite', () => {
  it('no confunde un nombre con otro que lo contiene, y mira espacios y tildes', () => {
    const lista = [art('1', 'Pan de molde'), art('2', '  Café  ')]
    expect(yaPendiente('Pan', lista)).toBeUndefined()
    expect(yaPendiente('cafe', lista)?.id).toBe('2')
    expect(yaPendiente('', lista)).toBeUndefined()
  })
})
