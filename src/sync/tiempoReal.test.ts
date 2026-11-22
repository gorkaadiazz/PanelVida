// Tiempo real (Supabase Realtime) del Puente: escucharCambios con un cliente
// de mentira y su conexión con la sesión (cada aviso lanza una sincronización
// y al cerrar sesión se deja de escuchar).

import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { servidorActual, escucha } = vi.hoisted(() => ({
  servidorActual: { valor: null as unknown },
  escucha: {
    tablas: null as readonly string[] | null,
    aviso: null as null | (() => void),
    parar: null as unknown as ReturnType<typeof import('vitest').vi.fn>,
    llamadas: 0,
    usuario: '',
  },
}))

vi.mock('../lib/supabase', () => ({ supabase: {}, CLAVE_SESION: 'sb-prueba-auth-token' }))
vi.mock('../lib/auth', () => ({ salir: async () => {} }))
vi.mock('./remoto', async (original) => {
  const real = await original<typeof import('./remoto')>()
  return {
    TABLAS_EN_TIEMPO_REAL: real.TABLAS_EN_TIEMPO_REAL,
    crearRemotoSupabase: () => servidorActual.valor,
    escucharCambios: (_cliente: unknown, usuarioId: string, tablas: readonly string[], alCambiar: () => void) => {
      escucha.llamadas += 1
      escucha.usuario = usuarioId
      escucha.tablas = tablas
      escucha.aviso = alCambiar
      return escucha.parar
    },
  }
})

import { TABLAS_EN_TIEMPO_REAL } from './remoto'
import { estadoSync, reiniciarEstado } from './avisos'
import { detenerSync, iniciarSync } from './sesion'
import { crearServidorFalso, type ServidorFalso } from './servidorFalso'

let servidor: ServidorFalso

async function hasta(condicion: () => boolean, que: string) {
  for (let i = 0; i < 400; i++) {
    if (condicion()) return
    await new Promise((ok) => setTimeout(ok, 5))
  }
  throw new Error(`No ha llegado a cumplirse: ${que}`)
}

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }))
  vi.stubGlobal('navigator', { onLine: true })
  servidor = crearServidorFalso()
  servidorActual.valor = servidor
  escucha.tablas = null
  escucha.aviso = null
  escucha.llamadas = 0
  escucha.parar = vi.fn()
  reiniciarEstado()
})

afterEach(async () => {
  await detenerSync()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('la sesión escucha el tiempo real', () => {
  it('se escucha la tabla puente y un aviso hace que baje lo nuevo sin recargar', async () => {
    expect(TABLAS_EN_TIEMPO_REAL).toContain('puente')
    iniciarSync('usuario-1')
    await hasta(() => estadoSync().fase === 'sincronizado', 'primera sincronización')
    expect(escucha.llamadas).toBe(1)
    expect(escucha.tablas).toEqual(TABLAS_EN_TIEMPO_REAL)
    expect(escucha.usuario).toBe('usuario-1')

    // Otro dispositivo manda algo y Realtime avisa
    servidor.desdeOtroDispositivo('puente', { id: '22222222-2222-4222-8222-222222222222', tipo: 'texto', contenido: 'del móvil', dispositivo: 'Móvil', fijado: false })
    const antes = servidor.peticiones.length
    escucha.aviso?.()
    escucha.aviso?.()
    escucha.aviso?.()
    await hasta(() => servidor.peticiones.slice(antes).includes('descargar puente'), 'se descarga el puente')
    const { listarPuente } = await import('../repos/puente')
    expect((await listarPuente()).map((e) => e.contenido)).toEqual(['del móvil'])
    // Varios avisos seguidos se juntan en una sola sincronización
    await new Promise((ok) => setTimeout(ok, 400))
    expect(servidor.peticiones.slice(antes).filter((p) => p === 'descargar puente')).toHaveLength(1)
  })

  it('al parar la sincronización (cerrar sesión, cambiar de usuario) se deja de escuchar', async () => {
    iniciarSync('usuario-1')
    await hasta(() => estadoSync().fase === 'sincronizado', 'primera sincronización')
    await detenerSync()
    expect(escucha.parar).toHaveBeenCalledTimes(1)
  })
})

describe('escucharCambios (cliente de mentira)', () => {
  // La de verdad (arriba se sustituye para la sesión)
  let escucharReal: typeof import('./remoto').escucharCambios
  beforeEach(async () => {
    escucharReal = (await vi.importActual<typeof import('./remoto')>('./remoto')).escucharCambios
  })

  function clienteFalso() {
    const ons: { evento: string; filtro: Record<string, unknown>; cb: () => void }[] = []
    let alSuscribir: ((estado: string) => void) | null = null
    const canal = {
      on(evento: string, filtro: Record<string, unknown>, cb: () => void) {
        ons.push({ evento, filtro, cb })
        return canal
      },
      subscribe(cb: (estado: string) => void) {
        alSuscribir = cb
        return canal
      },
    }
    const cliente = { channel: vi.fn(() => canal), removeChannel: vi.fn(async () => 'ok') }
    return { cliente, canal, ons, estado: (e: string) => alSuscribir?.(e) }
  }

  it('escucha todos los eventos de cada tabla en public y avisa sin pasar datos', () => {
    const f = clienteFalso()
    const alCambiar = vi.fn()
    escucharReal(f.cliente, 'u1', ['puente', 'otra'], alCambiar)
    expect(f.ons.map((o) => [o.evento, o.filtro])).toEqual([
      ['postgres_changes', { event: '*', schema: 'public', table: 'puente', filter: 'user_id=eq.u1' }],
      // Con filtro Realtime no entrega los DELETE: van aparte, sin filtro
      ['postgres_changes', { event: 'DELETE', schema: 'public', table: 'puente' }],
      ['postgres_changes', { event: '*', schema: 'public', table: 'otra', filter: 'user_id=eq.u1' }],
      ['postgres_changes', { event: 'DELETE', schema: 'public', table: 'otra' }],
    ])
    f.ons[0].cb()
    f.ons[1].cb()
    expect(alCambiar).toHaveBeenCalledTimes(2)
    expect(alCambiar).toHaveBeenCalledWith()
  })

  it('al conectarse (o reconectarse) sincroniza; un error de canal no', () => {
    const f = clienteFalso()
    const alCambiar = vi.fn()
    escucharReal(f.cliente, 'u1', ['puente'], alCambiar)
    f.estado('CHANNEL_ERROR')
    f.estado('TIMED_OUT')
    expect(alCambiar).not.toHaveBeenCalled()
    f.estado('SUBSCRIBED')
    expect(alCambiar).toHaveBeenCalledTimes(1)
  })

  it('cada escucha usa un canal con nombre distinto y se puede quitar', () => {
    const f = clienteFalso()
    const parar = escucharReal(f.cliente, 'u1', ['puente'], () => {})
    escucharReal(f.cliente, 'u1', ['puente'], () => {})
    const [n1, n2] = f.cliente.channel.mock.calls.map((c) => (c as unknown[])[0])
    expect(n1).not.toBe(n2)
    parar()
    expect(f.cliente.removeChannel).toHaveBeenCalledWith(f.canal)
  })
})
