import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// supabase falso: guarda los manejadores de cada evento
const m = vi.hoisted(() => ({ manejadores: [] as (() => void)[], quitado: 0 }))
vi.mock('../lib/supabase', () => {
  const canal = {
    on: (_t: string, _f: unknown, cb: () => void) => {
      m.manejadores.push(cb)
      return canal
    },
    subscribe: () => canal,
  }
  return { supabase: { channel: () => canal, removeChannel: async () => void (m.quitado += 1) } }
})

const { escucharRed, ESPERA_AVISOS_RED_MS } = await import('./red')

beforeEach(() => {
  vi.useFakeTimers()
  m.manejadores = []
  m.quitado = 0
})
afterEach(() => vi.useRealTimers())

describe('escucharRed', () => {
  it('muchos eventos seguidos (un escaneo) avisan una sola vez cuando paran', () => {
    const alCambiar = vi.fn()
    escucharRed('u1', alCambiar)
    for (let i = 0; i < 500; i++) m.manejadores[i % 2]()
    expect(alCambiar).not.toHaveBeenCalled()
    vi.advanceTimersByTime(ESPERA_AVISOS_RED_MS)
    expect(alCambiar).toHaveBeenCalledTimes(1)
  })

  it('al dejar de escuchar no queda ningún aviso pendiente', () => {
    const alCambiar = vi.fn()
    const parar = escucharRed('u1', alCambiar)
    m.manejadores[0]()
    parar()
    vi.advanceTimersByTime(ESPERA_AVISOS_RED_MS * 2)
    expect(alCambiar).not.toHaveBeenCalled()
    expect(m.quitado).toBe(1)
  })
})
