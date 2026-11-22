// Casos límite (tester) de la pantalla de la red: uniones en cadena y en
// ciclo, orden, historial y nombres raros.
import { describe, expect, it } from 'vitest'
import { agrupar, desconocidosConectados, minutosConectado, nombreAparato, validarNombreAparato, type Aparato } from './red'

let n = 0
const ap = (id: string, extra: Partial<Aparato> = {}): Aparato => ({
  id,
  mac: `00:00:00:00:00:${String(++n % 100).padStart(2, '0')}`,
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

/** Cada aparato sale en UN grupo y una sola vez. */
function cadaUnoUnaVez(aparatos: Aparato[]) {
  const grupos = agrupar(aparatos)
  const ids = grupos.flatMap((g) => [g.principal.id, ...g.unidos.map((u) => u.id)])
  expect(ids.sort()).toEqual(aparatos.map((a) => a.id).sort())
  return grupos
}

describe('agrupar: uniones en cadena', () => {
  it('a → b → c: los tres en el grupo de c', () => {
    const g = cadaUnoUnaVez([ap('a', { unido_a: 'b' }), ap('b', { unido_a: 'c' }), ap('c', { nombre: 'Móvil', conocido: true })])
    expect(g).toHaveLength(1)
    expect(g[0].principal.id).toBe('c')
    expect(g[0].unidos.map((u) => u.id).sort()).toEqual(['a', 'b'])
  })
  it('una cadena de 15 no se cuelga y no pierde a nadie', () => {
    const l = Array.from({ length: 15 }, (_, i) => ap(`n${i}`, { unido_a: i < 14 ? `n${i + 1}` : null }))
    cadaUnoUnaVez(l)
  })
  it('unido a un aparato que ya no está (olvidado): es su propio principal', () => {
    const g = cadaUnoUnaVez([ap('a', { unido_a: 'borrado' })])
    expect(g[0].principal.id).toBe('a')
  })
})

describe('agrupar: ciclos (no los crea la app, pero la base de datos no los impide)', () => {
  it('x ↔ y', () => {
    cadaUnoUnaVez([ap('x', { unido_a: 'y' }), ap('y', { unido_a: 'x' })])
  })
  it('x → y → z → x: un solo grupo (son el mismo aparato), con principal fijo', () => {
    const g = cadaUnoUnaVez([ap('y', { unido_a: 'z' }), ap('z', { unido_a: 'x' }), ap('x', { unido_a: 'y' })])
    expect(g).toHaveLength(1)
    expect(g[0].principal.id).toBe('x')
  })
  it('una cola que entra en un ciclo: todos en el grupo del ciclo', () => {
    const g = cadaUnoUnaVez([ap('t', { unido_a: 'x' }), ap('x', { unido_a: 'y' }), ap('y', { unido_a: 'z' }), ap('z', { unido_a: 'x' })])
    expect(g).toHaveLength(1)
  })
})

describe('agrupar: estado del grupo', () => {
  it('sin nadie conectado: IP y última vez del más reciente', () => {
    const g = agrupar([
      ap('p', { conocido: true, ip: '192.168.1.2', ultima_vez: '2026-11-01T00:00:00Z' }),
      ap('u', { unido_a: 'p', ip: '192.168.1.3', ultima_vez: '2026-11-21T00:00:00Z' }),
    ])
    expect(g[0].conectado).toBe(false)
    expect(g[0].ip).toBe('192.168.1.3')
    expect(g[0].ultima_vez).toBe('2026-11-21T00:00:00Z')
  })
  it('un desconocido unido a un conocido sale con los conocidos', () => {
    const g = agrupar([ap('p', { nombre: 'Tele', conocido: true }), ap('u', { unido_a: 'p', conectado: true })])
    expect(desconocidosConectados([ap('p', { conocido: true }), ap('u', { unido_a: 'p', conectado: true })])).toEqual([])
    expect(g[0].conectado).toBe(true)
  })
  it('orden por nombre en español (tildes)', () => {
    const g = agrupar([ap('1', { nombre: 'Zeta' }), ap('2', { nombre: 'Ábaco' }), ap('3', { nombre: 'Barco' })])
    expect(g.map((x) => x.principal.nombre)).toEqual(['Ábaco', 'Barco', 'Zeta'])
  })
  it('lista vacía', () => {
    expect(agrupar([])).toEqual([])
    expect(desconocidosConectados([])).toEqual([])
  })
})

describe('nombres e historial', () => {
  it('validar: caracteres de control e invisibles fuera; emojis no se parten', () => {
    expect(validarNombreAparato('Tele‮\u0000 salón\n')).toBe('Tele salón')
    expect(validarNombreAparato('​​')).toBeNull()
    const largo = validarNombreAparato('😀'.repeat(50))!
    expect([...largo]).toHaveLength(40)
    expect(largo.endsWith('\uD83D')).toBe(false)
  })
  it('sin nombre ni fabricante: los 3 últimos bytes de la MAC', () => {
    expect(nombreAparato({ nombre: null, fabricante: null, aleatoria: false, mac: 'a4:2b:b0:11:22:33' })).toBe('Aparato 11:22:33')
  })
  it('historial: intervalos de cero minutos, al revés o vacíos', () => {
    expect(minutosConectado([])).toBe(0)
    expect(minutosConectado([{ desde: '2026-11-22T10:00:00Z', hasta: '2026-11-22T10:00:00Z' }])).toBe(0)
    expect(minutosConectado([{ desde: '2026-11-22T10:00:00Z', hasta: '2026-11-22T09:00:00Z' }])).toBe(0)
    // Cruzando el cambio de hora (25/10/2026 en Madrid, 01:00 UTC): con UTC no se pierde ni gana una hora
    expect(minutosConectado([{ desde: '2026-10-25T00:30:00Z', hasta: '2026-10-25T01:30:00Z' }])).toBe(60)
    // Postgres manda microsegundos
    expect(minutosConectado([{ desde: '2026-11-22T10:00:00.123456+00:00', hasta: '2026-11-22T10:30:00.123456+00:00' }])).toBe(30)
  })
})
