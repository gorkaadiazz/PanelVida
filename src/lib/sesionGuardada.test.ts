import { describe, expect, it } from 'vitest'
import { borrarSesionGuardada, claveDeSesion, leerSesionGuardada } from './sesionGuardada'

const CLAVE = 'sb-abcd1234-auth-token'

function almacen(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial))
  return {
    datos,
    getItem: (k: string) => datos.get(k) ?? null,
    removeItem: (k: string) => void datos.delete(k),
  }
}

const sesion = (extra: object = {}) =>
  JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_at: 1, user: { id: 'u1', email: 'x@example.com' }, ...extra })

describe('claveDeSesion', () => {
  it('es la clave por defecto de supabase-js', () => {
    expect(claveDeSesion('https://abcd1234.supabase.co')).toBe(CLAVE)
    expect(claveDeSesion('http://localhost:54321')).toBe('sb-localhost-auth-token')
  })
})

describe('leerSesionGuardada', () => {
  it('devuelve la sesión guardada aunque el token haya caducado', () => {
    const s = leerSesionGuardada(CLAVE, almacen({ [CLAVE]: sesion() }))
    expect(s?.user.id).toBe('u1')
  })

  it('null si no hay nada, no es JSON o le falta algo', () => {
    expect(leerSesionGuardada(CLAVE, almacen())).toBeNull()
    expect(leerSesionGuardada(CLAVE, almacen({ [CLAVE]: 'no es json' }))).toBeNull()
    expect(leerSesionGuardada(CLAVE, almacen({ [CLAVE]: 'null' }))).toBeNull()
    expect(leerSesionGuardada(CLAVE, almacen({ [CLAVE]: sesion({ user: null }) }))).toBeNull()
    expect(leerSesionGuardada(CLAVE, almacen({ [CLAVE]: sesion({ refresh_token: '' }) }))).toBeNull()
    expect(leerSesionGuardada(CLAVE, almacen({ [CLAVE]: sesion({ access_token: 5 }) }))).toBeNull()
  })

  it('no mira otras claves', () => {
    expect(leerSesionGuardada(CLAVE, almacen({ 'sb-otro-auth-token': sesion() }))).toBeNull()
  })

  it('no lanza si el almacén falla o no existe', () => {
    const roto = {
      getItem: () => {
        throw new Error('bloqueado')
      },
      removeItem: () => {
        throw new Error('bloqueado')
      },
    }
    expect(leerSesionGuardada(CLAVE, roto)).toBeNull()
    expect(leerSesionGuardada(CLAVE, null)).toBeNull()
    expect(() => borrarSesionGuardada(CLAVE, roto)).not.toThrow()
    expect(() => borrarSesionGuardada(CLAVE, null)).not.toThrow()
  })
})

describe('borrarSesionGuardada', () => {
  it('borra la sesión y sus claves auxiliares, y nada más', () => {
    const a = almacen({ [CLAVE]: sesion(), [`${CLAVE}-code-verifier`]: 'x', [`${CLAVE}-user`]: '{}', otra: 'se queda' })
    borrarSesionGuardada(CLAVE, a)
    expect([...a.datos.keys()]).toEqual(['otra'])
  })
})
