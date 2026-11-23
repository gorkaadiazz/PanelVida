import { describe, expect, it } from 'vitest'
import { agrupar, desconocidosConectados, minutosConectado, nombreAparato, validarNombreAparato, type Aparato } from './red'

const ap = (id: string, extra: Partial<Aparato> = {}): Aparato => ({
  id,
  mac: `00:00:00:00:00:0${id.length}`,
  nombre: null,
  fabricante: null,
  ip: null,
  aleatoria: false,
  conectado: false,
  conocido: false,
  unido_a: null,
  primera_vez: '2026-11-01T00:00:00Z',
  ultima_vez: '2026-11-20T00:00:00Z',
  ...extra,
})

describe('agrupar', () => {
  it('desconocidos arriba; dentro, conectados primero y por nombre', () => {
    const r = agrupar([
      ap('a', { nombre: 'Router', conocido: true, conectado: true }),
      ap('b', { nombre: 'Zeta', conectado: false }),
      ap('c', { nombre: 'Alfa', conectado: true }),
      ap('d', { nombre: 'Tele', conocido: true }),
    ])
    expect(r.map((g) => g.principal.nombre)).toEqual(['Alfa', 'Zeta', 'Router', 'Tele'])
  })

  it('los unidos cuentan como su principal (conectado, IP y última vez)', () => {
    const r = agrupar([
      ap('movil', { nombre: 'Móvil de Ana', conocido: true, ultima_vez: '2026-11-10T00:00:00Z', ip: '192.168.1.5' }),
      ap('mac2', { aleatoria: true, unido_a: 'movil', conectado: true, ip: '192.168.1.9', ultima_vez: '2026-11-22T00:00:00Z' }),
    ])
    expect(r).toHaveLength(1)
    expect(r[0].conectado).toBe(true)
    expect(r[0].ip).toBe('192.168.1.9')
    expect(r[0].ultima_vez).toBe('2026-11-22T00:00:00Z')
    expect(r[0].unidos.map((a) => a.id)).toEqual(['mac2'])
  })

  it('cadenas y ciclos de uniones no cuelgan', () => {
    const r = agrupar([ap('x', { unido_a: 'y' }), ap('y', { unido_a: 'x' })])
    expect(r.length).toBeGreaterThanOrEqual(1)
  })
})

describe('textos', () => {
  it('nombre del aparato', () => {
    expect(nombreAparato({ nombre: 'Tele', fabricante: 'LG', aleatoria: false, mac: 'a4:00:00:00:00:01' })).toBe('Tele')
    expect(nombreAparato({ nombre: null, fabricante: 'LG', aleatoria: false, mac: 'a4:00:00:00:00:01' })).toBe('LG')
    expect(nombreAparato({ nombre: null, fabricante: null, aleatoria: true, mac: 'da:00:00:00:00:01' })).toBe('Aparato con MAC privada')
    expect(nombreAparato({ nombre: null, fabricante: null, aleatoria: false, mac: 'a4:00:00:00:00:01' })).toBe('Aparato 00:00:01')
  })
  it('validar nombre', () => {
    expect(validarNombreAparato('  Tele   salón ')).toBe('Tele salón')
    expect(validarNombreAparato('  ')).toBeNull()
    expect(validarNombreAparato('x'.repeat(50))).toHaveLength(40)
  })
})

describe('desconocidos y historial', () => {
  it('solo los desconocidos conectados', () => {
    const r = desconocidosConectados([ap('a', { conectado: true }), ap('b', { conectado: true, conocido: true }), ap('c')])
    expect(r.map((g) => g.principal.id)).toEqual(['a'])
  })
  it('minutos conectado', () => {
    expect(minutosConectado([{ desde: '2026-11-22T10:00:00Z', hasta: '2026-11-22T10:30:00Z' }, { desde: '2026-11-22T12:00:00Z', hasta: '2026-11-22T12:15:00Z' }])).toBe(45)
  })
})

describe('nombre anunciado en la red', () => {
  it('tu nombre manda; si es conocido, cómo se anuncia; si no, el fabricante', () => {
    const base = { fabricante: 'Amazon Technologies Inc.', aleatoria: false, mac: 'a4:00:00:00:00:01' }
    expect(nombreAparato({ ...base, nombre: 'Tele', nombre_red: 'Amazon Fire TV o Echo' })).toBe('Tele')
    expect(nombreAparato({ ...base, nombre: null, nombre_red: 'Amazon Fire TV o Echo', conocido: true })).toBe('Amazon Fire TV o Echo')
    expect(nombreAparato({ ...base, nombre: null, nombre_red: null, conocido: true })).toBe('Amazon Technologies Inc.')
  })
  it('un DESCONOCIDO no se presenta con su nombre anunciado (podría hacerse pasar por uno tuyo)', () => {
    expect(nombreAparato({ nombre: null, nombre_red: 'iPhone de Ana', fabricante: null, aleatoria: true, mac: 'da:00:00:00:00:01', conocido: false })).toBe('Aparato con MAC privada')
  })
})
