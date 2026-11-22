import { describe, expect, it } from 'vitest'
import { URL_POR_DEFECTO, leerConfig, leerCredenciales, normalizarCodigoVincular, normalizarMac, permisosSeguros } from './config.ts'

describe('leerConfig', () => {
  it('vacío: valores por defecto', () => {
    expect(leerConfig({})).toEqual({ config: { supabaseUrl: URL_POR_DEFECTO, apps: [], macRouter: null }, avisos: [] })
    expect(leerConfig(null).config.apps).toEqual([])
  })

  it('apps válidas, sin shell (lista de argumentos)', () => {
    const { config, avisos } = leerConfig({ apps: { Firefox: ['firefox'], ' Steam ': ['steam', '-silent'] }, macRouter: 'AA-BB-CC-DD-EE-FF' })
    expect(config.apps).toEqual([
      { nombre: 'Firefox', orden: ['firefox'] },
      { nombre: 'Steam', orden: ['steam', '-silent'] },
    ])
    expect(config.macRouter).toBe('aa:bb:cc:dd:ee:ff')
    expect(avisos).toEqual([])
  })

  it('ignora lo que no vale y avisa', () => {
    const { config, avisos } = leerConfig({
      supabaseUrl: 'http://malo.com',
      apps: { 'Una cadena': 'rm -rf /', Vacia: [], firefox: ['firefox'], FIREFOX: ['otro'] },
      macRouter: 'no-es-mac',
    })
    expect(config.supabaseUrl).toBe(URL_POR_DEFECTO)
    expect(config.apps).toEqual([{ nombre: 'firefox', orden: ['firefox'] }])
    expect(config.macRouter).toBeNull()
    expect(avisos).toHaveLength(5)
  })
})

describe('credenciales', () => {
  const buenas = {
    supabaseUrl: 'https://abc.supabase.co',
    anonKey: 'k',
    email: 'agente-1@agente.invalid',
    password: 'x'.repeat(43),
    agenteId: '11111111-1111-4111-8111-111111111111',
    nombre: 'PC casa',
  }
  it('acepta las que escribe vincular', () => {
    expect(leerCredenciales(buenas)).toEqual(buenas)
  })
  it('rechaza las incompletas o raras (no son de un agente)', () => {
    expect(leerCredenciales({ ...buenas, email: 'yo@gmail.com' })).toBeNull()
    expect(leerCredenciales({ ...buenas, password: 'corta' })).toBeNull()
    expect(leerCredenciales({ ...buenas, supabaseUrl: 'https://evil.com' })).toBeNull()
    expect(leerCredenciales('texto')).toBeNull()
  })
})

describe('otros', () => {
  it('código de vincular', () => {
    expect(normalizarCodigoVincular('abcd-efgh')).toBe('ABCDEFGH')
    expect(normalizarCodigoVincular('ABCD-EFG0')).toBeNull()
    expect(normalizarCodigoVincular('ABC')).toBeNull()
  })
  it('MAC', () => {
    expect(normalizarMac(' 0A:1b:2C:3d:4E:5f ')).toBe('0a:1b:2c:3d:4e:5f')
    expect(normalizarMac('0a:1b:2c:3d:4e')).toBeNull()
  })
  it('permisos: solo el dueño', () => {
    expect(permisosSeguros(0o600)).toBe(true)
    expect(permisosSeguros(0o400)).toBe(true)
    expect(permisosSeguros(0o644)).toBe(false)
    expect(permisosSeguros(0o660)).toBe(false)
  })
})
