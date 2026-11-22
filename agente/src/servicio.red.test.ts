// servicio.ts · el vigilante de la red (tester), sin red: cliente de Supabase,
// escanear() y fetch falsos. Sin macRouter no escanea; con aparatos nuevos
// llama a aviso-red con el token del agente; un fallo no lo para.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ROUTER = '74:00:00:00:00:02'
const m = vi.hoisted(() => ({
  config: { supabaseUrl: 'https://abc.supabase.co', apps: [] as { nombre: string; orden: string[] }[], macRouter: null as string | null },
  cliente: null as unknown,
  escanear: vi.fn(async (_mac: string | null): Promise<unknown> => null),
}))

vi.mock('./archivos.ts', () => ({
  cargarCredenciales: async () => ({ supabaseUrl: 'https://abc.supabase.co', anonKey: 'clave-anon', email: 'agente-1@agente.invalid', password: 'x'.repeat(43), agenteId: 'ag', nombre: 'PC' }),
  cargarConfig: async () => m.config,
}))
vi.mock('./conexion.ts', () => ({ Desvinculado: class extends Error {}, conectar: async () => m.cliente }))
vi.mock('./escritorio.ts', () => ({ copiar: async () => true, notificar: async () => {} }))
vi.mock('./mando.ts', () => ({ ejecutar: async () => {}, sesionGrafica: async () => null, volumenActual: async () => null }))
vi.mock('./red.ts', () => ({ escanear: (mac: string | null) => m.escanear(mac) }))

const { iniciarServicio } = await import('./servicio.ts')

const ESCANEO = { dispositivos: [{ mac: ROUTER, ip: '192.168.1.1', fabricante: null }] }

function clienteFalso() {
  const rpcRed = vi.fn(async (_a: unknown): Promise<{ data: unknown; error: null | { message: string } }> => ({ data: 0, error: null }))
  const canal = { on: () => canal, subscribe: () => canal }
  const cliente = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { user_id: 'u', nombre: 'PC' }, error: null }) }) }) }),
    rpc: async (n: string, a?: unknown) => (n === 'agente_red' ? rpcRed(a) : { data: [], error: null }),
    channel: () => canal,
    removeChannel: async () => 'ok',
    auth: { signOut: async () => ({ error: null }), getSession: async () => ({ data: { session: { access_token: 'token-del-agente' } } }) },
  }
  return { cliente, rpcRed }
}

let fetchFalso: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(process, 'exit').mockImplementation((() => undefined as never) as typeof process.exit)
  vi.spyOn(process, 'on').mockImplementation((() => process) as typeof process.on)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  m.config = { ...m.config, macRouter: ROUTER }
  m.escanear.mockReset()
  m.escanear.mockResolvedValue(ESCANEO)
  fetchFalso = vi.fn(async () => new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', fetchFalso)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function arrancar() {
  const c = clienteFalso()
  m.cliente = c.cliente
  await iniciarServicio()
  return c
}

describe('vigilante de la red', () => {
  it('sin macRouter en config.json no escanea nunca', async () => {
    m.config = { ...m.config, macRouter: null }
    const { rpcRed } = await arrancar()
    await vi.advanceTimersByTimeAsync(30 * 60_000)
    expect(m.escanear).not.toHaveBeenCalled()
    expect(rpcRed).not.toHaveBeenCalled()
    expect(fetchFalso).not.toHaveBeenCalled()
  })

  it('primer escaneo a los 30 s y luego cada 5 minutos, con la MAC del router de config', async () => {
    await arrancar()
    await vi.advanceTimersByTimeAsync(29_999)
    expect(m.escanear).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(m.escanear).toHaveBeenCalledTimes(1)
    expect(m.escanear).toHaveBeenCalledWith(ROUTER)
    await vi.advanceTimersByTimeAsync(5 * 60_000 - 30_000)
    expect(m.escanear).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(m.escanear).toHaveBeenCalledTimes(3)
  })

  it('fuera de casa (escanear da null): no manda nada', async () => {
    m.escanear.mockResolvedValue(null)
    const { rpcRed } = await arrancar()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(m.escanear).toHaveBeenCalledTimes(1)
    expect(rpcRed).not.toHaveBeenCalled()
    expect(fetchFalso).not.toHaveBeenCalled()
  })

  it('manda el escaneo; sin nada nuevo (0) no llama a aviso-red', async () => {
    const { rpcRed } = await arrancar()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(rpcRed).toHaveBeenCalledWith({ dispositivos: ESCANEO.dispositivos })
    expect(fetchFalso).not.toHaveBeenCalled()
  })

  it('con aparatos nuevos llama a aviso-red (POST) con el token del agente y la clave anon', async () => {
    const { rpcRed } = await arrancar()
    rpcRed.mockResolvedValue({ data: 2, error: null })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetchFalso).toHaveBeenCalledTimes(1)
    const [url, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://abc.supabase.co/functions/v1/aviso-red')
    expect(opciones.method).toBe('POST')
    expect(opciones.headers).toEqual({ authorization: 'Bearer token-del-agente', apikey: 'clave-anon' })
    // No manda la lista de aparatos ni nada más a la función (ella lee lo reservado)
    expect(opciones.body).toBeUndefined()
  })

  it('un fallo en escanear, en agente_red o en aviso-red no lo para: el siguiente escaneo sigue', async () => {
    const { rpcRed } = await arrancar()
    m.escanear.mockRejectedValueOnce(new Error('ip: command not found'))
    await vi.advanceTimersByTimeAsync(30_000)
    expect(rpcRed).not.toHaveBeenCalled()

    rpcRed.mockResolvedValueOnce({ data: null, error: { message: 'fetch failed' } })
    await vi.advanceTimersByTimeAsync(5 * 60_000 - 30_000)
    expect(rpcRed).toHaveBeenCalledTimes(1)
    expect(fetchFalso).not.toHaveBeenCalled()

    rpcRed.mockResolvedValue({ data: 1, error: null })
    fetchFalso.mockRejectedValueOnce(new TypeError('fetch failed'))
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(fetchFalso).toHaveBeenCalledTimes(1)

    fetchFalso.mockResolvedValueOnce(new Response('{}', { status: 500 }))
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(fetchFalso).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(m.escanear).toHaveBeenCalledTimes(5)
    expect(fetchFalso).toHaveBeenCalledTimes(3)
    expect(process.exit).not.toHaveBeenCalled()
  })

  it('un escaneo lento no se solapa con el siguiente', async () => {
    let acabar: (v: unknown) => void = () => {}
    m.escanear.mockImplementationOnce(() => new Promise((ok) => (acabar = ok)))
    await arrancar()
    await vi.advanceTimersByTimeAsync(30_000)
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(m.escanear).toHaveBeenCalledTimes(1)
    acabar(null)
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(m.escanear).toHaveBeenCalledTimes(2)
  })
})
