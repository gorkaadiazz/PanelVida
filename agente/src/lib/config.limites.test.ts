// Casos límite de config.json y credenciales.json raros o manipulados.
import { describe, expect, it } from 'vitest'
import { URL_POR_DEFECTO, esUrlSupabase, leerConfig, leerCredenciales, normalizarCodigoVincular, normalizarMac, permisosSeguros } from './config.ts'

describe('leerConfig con config.json raro', () => {
  it('JSON que no es objeto: valores por defecto sin romper', () => {
    for (const json of [undefined, null, 42, 'texto', true, [], [1, 2]]) {
      expect(leerConfig(json).config).toEqual({ supabaseUrl: URL_POR_DEFECTO, apps: [], macRouter: null })
    }
  })

  it('apps que no es un objeto: aviso y ninguna app', () => {
    for (const apps of [null, 'firefox', ['firefox'], 3]) {
      const { config, avisos } = leerConfig({ apps })
      expect(config.apps).toEqual([])
      expect(avisos).toHaveLength(1)
    }
  })

  it('órdenes no válidas se ignoran (cadena, vacía, no texto, NUL, demasiado larga o con demasiados argumentos)', () => {
    const { config, avisos } = leerConfig({
      apps: {
        Cadena: 'sh -c "rm -rf ~"',
        Vacia: [],
        ConNumero: ['firefox', 1],
        ArgVacio: ['firefox', ''],
        ConNul: ['firefox\0', '-x'],
        Larga: ['a'.repeat(201)],
        Muchos: Array.from({ length: 11 }, () => 'x'),
        Objeto: { 0: 'firefox' },
        Buena: ['firefox', '--new-window'],
      },
    })
    expect(config.apps).toEqual([{ nombre: 'Buena', orden: ['firefox', '--new-window'] }])
    expect(avisos).toHaveLength(8)
  })

  it('límites exactos: argumento de 200, 10 argumentos y nombre de 40 valen; 41 no', () => {
    const { config } = leerConfig({
      apps: {
        ['n'.repeat(40)]: ['a'.repeat(200)],
        Diez: Array.from({ length: 10 }, () => 'x'),
        ['m'.repeat(41)]: ['x'],
      },
    })
    expect(config.apps.map((a) => a.nombre)).toEqual(['n'.repeat(40), 'Diez'])
  })

  it('nombres: espacios se juntan, controles no valen, solo espacios no vale', () => {
    const { config } = leerConfig({ apps: { '  Mi\n\tapp  ': ['x'], 'Con\u0007campana': ['x'], '   ': ['x'], '': ['x'] } })
    expect(config.apps).toEqual([{ nombre: 'Mi app', orden: ['x'] }])
  })

  it('repetidas sin distinguir mayúsculas ni espacios: gana la primera', () => {
    const { config, avisos } = leerConfig({ apps: { Steam: ['steam'], ' STEAM ': ['otro'], steam: ['otro2'] } })
    expect(config.apps).toEqual([{ nombre: 'Steam', orden: ['steam'] }])
    expect(avisos).toHaveLength(2)
  })

  it('como mucho 30 apps', () => {
    const apps = Object.fromEntries(Array.from({ length: 35 }, (_, i) => [`App ${i}`, ['x']]))
    const { config, avisos } = leerConfig({ apps })
    expect(config.apps).toHaveLength(30)
    expect(avisos).toContain('Como mucho 30 apps')
  })

  it('__proto__ y constructor en el JSON no contaminan nada', () => {
    const json = JSON.parse('{"apps": {"__proto__": ["x"], "constructor": ["y"]}, "__proto__": {"supabaseUrl": "https://evil.supabase.co"}}')
    const { config } = leerConfig(json)
    expect(config.supabaseUrl).toBe(URL_POR_DEFECTO)
    expect(({} as Record<string, unknown>).supabaseUrl).toBeUndefined()
    expect(config.apps.every((a) => Array.isArray(a.orden))).toBe(true)
  })

  it('la orden se guarda como lista: nunca se junta en una cadena para una shell', () => {
    const { config } = leerConfig({ apps: { Raro: ['firefox', '; rm -rf ~', '$(reboot)'] } })
    expect(config.apps[0].orden).toEqual(['firefox', '; rm -rf ~', '$(reboot)'])
  })

  it('macRouter: null sin aviso; número, vacío o sin separadores, aviso', () => {
    expect(leerConfig({ macRouter: null })).toEqual(leerConfig({}))
    for (const macRouter of [123, '', 'aabbccddeeff', 'gg:bb:cc:dd:ee:ff', 'aa:bb:cc:dd:ee:ff:00']) {
      const { config, avisos } = leerConfig({ macRouter })
      expect(config.macRouter).toBeNull()
      expect(avisos).toHaveLength(1)
    }
  })
})

describe('esUrlSupabase: solo https://<proyecto>.supabase.co', () => {
  it.each([
    'http://abc.supabase.co',
    'https://abc.supabase.co/',
    'https://abc.supabase.co.evil.com',
    'https://evil.com/.supabase.co',
    'https://evil.com#.supabase.co',
    'https://user@abc.supabase.co',
    'https://abc.supabase.co:8443',
    'https://ABC.supabase.co',
    'https://abc.supabase.co\n',
    'https://a.b.supabase.co',
    'https://.supabase.co',
    '',
  ])('rechaza %j', (url) => {
    expect(esUrlSupabase(url)).toBe(false)
  })
  it('acepta la buena', () => {
    expect(esUrlSupabase('https://pmcacougksqimitapiqr.supabase.co')).toBe(true)
    expect(esUrlSupabase(URL_POR_DEFECTO)).toBe(true)
  })
})

describe('leerCredenciales manipuladas', () => {
  const buenas = {
    supabaseUrl: 'https://abc.supabase.co',
    anonKey: 'k',
    email: 'agente-1@agente.invalid',
    password: 'x'.repeat(43),
    agenteId: '11111111-1111-4111-8111-111111111111',
    nombre: 'PC casa',
  }
  it('cada campo que falte o no sea texto: null', () => {
    for (const campo of Object.keys(buenas)) {
      const sin = { ...buenas } as Record<string, unknown>
      delete sin[campo]
      expect(leerCredenciales(sin)).toBeNull()
      expect(leerCredenciales({ ...buenas, [campo]: 123 })).toBeNull()
    }
  })
  it('servidor que no es Supabase (robar la contraseña mandándola a otro sitio): null', () => {
    for (const supabaseUrl of ['https://evil.com', 'http://abc.supabase.co', 'https://abc.supabase.co.evil.com']) {
      expect(leerCredenciales({ ...buenas, supabaseUrl })).toBeNull()
    }
  })
  it('email de una persona (no de un agente): null', () => {
    expect(leerCredenciales({ ...buenas, email: 'yo@gmail.com' })).toBeNull()
    expect(leerCredenciales({ ...buenas, email: 'agente@agente.invalid.evil.com' })).toBeNull()
  })
  it('contraseña: 20 vale, 19 no', () => {
    expect(leerCredenciales({ ...buenas, password: 'x'.repeat(20) })).not.toBeNull()
    expect(leerCredenciales({ ...buenas, password: 'x'.repeat(19) })).toBeNull()
  })
  it('agenteId que no es un uuid: null', () => {
    for (const agenteId of ['1', '11111111-1111-4111-8111-11111111111', "11111111-1111-4111-8111-111111111111' or 1=1", '11111111-1111-4111-8111-11111111111g']) {
      expect(leerCredenciales({ ...buenas, agenteId })).toBeNull()
    }
  })
  it('campos de más (p. ej. una service role) no se cuelan', () => {
    const r = leerCredenciales({ ...buenas, serviceRole: 'secreto', __proto__: { x: 1 } })
    expect(r).toEqual(buenas)
    expect(Object.keys(r!)).toEqual(Object.keys(buenas))
  })
  it('arrays y valores primitivos: null', () => {
    for (const json of [null, undefined, [], [buenas], 1, 'x']) expect(leerCredenciales(json)).toBeNull()
  })
})

describe('normalizarCodigoVincular', () => {
  it('acepta guiones, espacios y minúsculas', () => {
    expect(normalizarCodigoVincular(' abcd efgh ')).toBe('ABCDEFGH')
    expect(normalizarCodigoVincular('AB-CD-EF-GH')).toBe('ABCDEFGH')
    expect(normalizarCodigoVincular('2345-6789')).toBe('23456789')
  })
  it('rechaza letras y números que se confunden (I, O, 0, 1) y longitudes que no son 8', () => {
    for (const c of ['ABCD-EFGI', 'ABCD-EFGO', 'ABCD-EFG1', 'ABCD-EFG0', 'ABCD-EFG', 'ABCD-EFGHJ', '', '--------']) {
      expect(normalizarCodigoVincular(c)).toBeNull()
    }
  })
  it('texto con órdenes de shell o letras raras no se convierte en un código válido', () => {
    expect(normalizarCodigoVincular('ABCD-EFGH; rm -rf ~')).toBeNull()
    expect(normalizarCodigoVincular('ÁBCD-EFGH')).toBeNull() // la Á se quita: quedan 7
    expect(normalizarCodigoVincular('ＡＢＣＤ-ＥＦＧＨ')).toBeNull() // ancho completo
  })
})

describe('normalizarMac y permisosSeguros', () => {
  it('MAC con guiones, mayúsculas y espacios', () => {
    expect(normalizarMac('AA-BB-CC-DD-EE-FF')).toBe('aa:bb:cc:dd:ee:ff')
    expect(normalizarMac(null)).toBeNull()
    expect(normalizarMac('aa:bb:cc:dd:ee:ff\nrm')).toBeNull()
  })
  it('permisos con los bits de tipo de archivo (st_mode completo)', () => {
    expect(permisosSeguros(0o100600)).toBe(true)
    expect(permisosSeguros(0o100604)).toBe(false)
    expect(permisosSeguros(0o100620)).toBe(false)
    expect(permisosSeguros(0o100601)).toBe(false)
    expect(permisosSeguros(0o100000)).toBe(true)
  })
})

describe('agenteId estricto', () => {
  it('36 guiones o un uuid sin el formato 8-4-4-4-12 ya no valen', () => {
    const base = { supabaseUrl: 'https://abc.supabase.co', anonKey: 'k', email: 'agente-1@agente.invalid', password: 'x'.repeat(43), nombre: 'PC' }
    expect(leerCredenciales({ ...base, agenteId: '-'.repeat(36) })).toBeNull()
    expect(leerCredenciales({ ...base, agenteId: '1111111111111-4111-8111-1111111111111' })).toBeNull()
    expect(leerCredenciales({ ...base, agenteId: '11111111-1111-4111-8111-111111111111' })).not.toBeNull()
  })
})
