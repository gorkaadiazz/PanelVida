import { afterEach, describe, expect, it, vi } from 'vitest'
import { esUuid, idMarca, sha1, uuid, uuidV5 } from './uuid'

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
const texto = (s: string) => new TextEncoder().encode(s)

afterEach(() => vi.unstubAllGlobals())

describe('sha1', () => {
  it('coincide con los vectores de prueba conocidos', () => {
    expect(hex(sha1(texto('')))).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709')
    expect(hex(sha1(texto('abc')))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
  })

  it('coincide con el SHA-1 de la plataforma (WebCrypto) en todos los tamaños de relleno', async () => {
    for (const n of [1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000]) {
      const datos = Uint8Array.from({ length: n }, (_, i) => (i * 31 + n) % 256)
      const esperado = new Uint8Array(await crypto.subtle.digest('SHA-1', datos))
      expect(hex(sha1(datos)), `longitud ${n}`).toBe(hex(esperado))
    }
  })
})

describe('uuidV5', () => {
  const DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

  it('coincide con los ejemplos del estándar', () => {
    expect(uuidV5('www.example.com', DNS)).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2')
    expect(uuidV5('python.org', DNS)).toBe('886313e1-3b8a-5372-9b90-0c9aee199e5d')
  })

  it('lanza si el espacio no es un UUID', () => {
    expect(() => uuidV5('x', 'no-es-uuid')).toThrow(RangeError)
  })
})

describe('idMarca', () => {
  const HABITO = '3f2b8c1e-5d4a-4f6b-9a7c-1e2d3c4b5a69'

  it('es determinista: mismo hábito y día, mismo id en cualquier dispositivo', () => {
    expect(idMarca(HABITO, '2026-11-13')).toBe(idMarca(HABITO, '2026-11-13'))
    expect(idMarca(HABITO.toUpperCase(), '2026-11-13')).toBe(idMarca(HABITO, '2026-11-13'))
    // Valor fijado: si este test cambia, los dispositivos dejarían de coincidir
    // (calculado aparte con el SHA-1 de Node)
    expect(idMarca(HABITO, '2026-11-13')).toBe('b6c58bbd-7f41-5eac-a6cb-e99e4631b765')
  })

  it('cambia con el día y con el hábito, y es un UUID v5 válido', () => {
    const a = idMarca(HABITO, '2026-11-13')
    expect(a).not.toBe(idMarca(HABITO, '2026-11-14'))
    expect(a).not.toBe(idMarca('00000000-0000-4000-8000-000000000001', '2026-11-13'))
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

describe('uuid', () => {
  it('genera UUID v4 distintos', () => {
    const a = uuid()
    expect(esUuid(a)).toBe(true)
    expect(a).not.toBe(uuid())
  })

  it('funciona sin crypto.randomUUID (contexto no seguro)', () => {
    vi.stubGlobal('crypto', { getRandomValues: (b: Uint8Array) => b.fill(0xab) })
    expect(uuid()).toBe('abababab-abab-4bab-abab-abababababab')
  })
})
