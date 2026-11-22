// servicio.ts sin red: un cliente de Supabase falso, credenciales y config
// falsas y el escritorio espiado. Comprueba el latido de cada minuto con las
// apps de config.json, la reacción a un INSERT del Puente y que se para
// cuando lo desvinculan (42501 o credenciales que ya no valen).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  credenciales: null as unknown,
  config: { supabaseUrl: 'https://abc.supabase.co', apps: [] as { nombre: string; orden: string[] }[], macRouter: null },
  cliente: null as unknown,
  errorConectar: null as Error | null,
  copiar: vi.fn(async (_t: string) => true),
  notificar: vi.fn(async (_t: string, _c: string) => {}),
}))

vi.mock('./archivos.ts', () => ({
  cargarCredenciales: async () => m.credenciales,
  cargarConfig: async () => m.config,
}))
vi.mock('./conexion.ts', () => {
  class Desvinculado extends Error {}
  return {
    Desvinculado,
    conectar: async () => {
      if (m.errorConectar) throw m.errorConectar
      return m.cliente
    },
  }
})
vi.mock('./escritorio.ts', () => ({ copiar: m.copiar, notificar: m.notificar }))

const { iniciarServicio, VERSION } = await import('./servicio.ts')
const { Desvinculado } = await import('./conexion.ts')

const DUENO = 'aaaaaaaa-0000-4000-8000-00000000000a'
const AGENTE = '99999999-0000-4000-8000-000000000009'

type AlCambio = (cambio: { new: Record<string, unknown> }) => void

function clienteFalso(opciones: { fila?: { user_id: string; nombre: string } | null; errorFila?: unknown } = {}) {
  const f = {
    rpc: vi.fn(async (_n: string, _a: unknown) => ({ data: null, error: null as null | { code?: string; message: string } })),
    on: vi.fn(),
    alCambio: null as AlCambio | null,
    filtro: null as unknown,
    canalNombre: '',
    eq: vi.fn(),
    from: vi.fn(),
    removeChannel: vi.fn(async () => 'ok'),
    signOut: vi.fn(async () => ({ error: null })),
  }
  const canal = {
    on: (_tipo: string, filtro: unknown, cb: AlCambio) => {
      f.filtro = filtro
      f.alCambio = cb
      f.on(_tipo, filtro)
      return canal
    },
    subscribe: (cb?: (estado: string) => void) => {
      cb?.('SUBSCRIBED')
      return canal
    },
  }
  const cliente = {
    from: (tabla: string) => {
      f.from(tabla)
      return {
        select: () => ({
          eq: (col: string, val: string) => {
            f.eq(col, val)
            return { maybeSingle: async () => ({ data: opciones.fila === undefined ? { user_id: DUENO, nombre: 'PC casa' } : opciones.fila, error: opciones.errorFila ?? null }) }
          },
        }),
      }
    },
    rpc: f.rpc,
    channel: (nombre: string) => {
      f.canalNombre = nombre
      return canal
    },
    removeChannel: f.removeChannel,
    auth: { signOut: f.signOut },
  }
  return { f, cliente }
}

/** process.exit falso: apunta el código y no sale. */
let salidas: (number | undefined)[]
let manejadores: Map<string, () => void>

beforeEach(() => {
  vi.useFakeTimers()
  salidas = []
  manejadores = new Map()
  vi.spyOn(process, 'exit').mockImplementation(((codigo?: number) => {
    salidas.push(codigo)
    return undefined as never
  }) as typeof process.exit)
  // Que no se queden enganchados SIGTERM/SIGINT de verdad en el proceso de los tests
  vi.spyOn(process, 'on').mockImplementation(((evento: string, fn: () => void) => {
    manejadores.set(evento, fn)
    return process
  }) as typeof process.on)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  m.credenciales = { supabaseUrl: 'https://abc.supabase.co', anonKey: 'k', email: 'agente-1@agente.invalid', password: 'x'.repeat(43), agenteId: AGENTE, nombre: 'PC casa' }
  m.config = { supabaseUrl: 'https://abc.supabase.co', apps: [{ nombre: 'Firefox', orden: ['firefox'] }, { nombre: 'Steam', orden: ['steam', '-silent'] }], macRouter: null }
  m.errorConectar = null
  m.copiar.mockClear()
  m.notificar.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function arrancar(f: ReturnType<typeof clienteFalso>) {
  m.cliente = f.cliente
  await iniciarServicio()
  return f.f
}

const esperar = () => vi.advanceTimersByTimeAsync(0)

describe('latido', () => {
  it('late al arrancar y cada minuto con los NOMBRES de las apps de config (nunca sus órdenes)', async () => {
    const f = await arrancar(clienteFalso())
    expect(f.rpc).toHaveBeenCalledTimes(1)
    expect(f.rpc).toHaveBeenLastCalledWith('agente_latido', { apps: ['Firefox', 'Steam'], version: VERSION })
    await vi.advanceTimersByTimeAsync(59_999)
    expect(f.rpc).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(f.rpc).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(60_000 * 3)
    expect(f.rpc).toHaveBeenCalledTimes(5)
    expect(JSON.stringify(f.rpc.mock.calls)).not.toContain('-silent')
    expect(f.rpc.mock.calls.every(([n]) => n === 'agente_latido')).toBe(true)
    expect(salidas).toEqual([])
  })

  it('sin apps en config: latido con lista vacía', async () => {
    m.config = { ...m.config, apps: [] }
    const f = await arrancar(clienteFalso())
    expect(f.rpc).toHaveBeenLastCalledWith('agente_latido', { apps: [], version: VERSION })
  })

  it('pregunta por SU fila (la del agente de las credenciales)', async () => {
    const f = await arrancar(clienteFalso())
    expect(f.from).toHaveBeenCalledWith('agentes')
    expect(f.eq).toHaveBeenCalledWith('id', AGENTE)
  })

  it('un fallo de red en el latido no lo para: sigue latiendo', async () => {
    const { f, cliente } = clienteFalso()
    f.rpc.mockResolvedValueOnce({ data: null, error: { code: '', message: 'fetch failed' } })
    await arrancar({ f, cliente })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(f.rpc).toHaveBeenCalledTimes(2)
    expect(salidas).toEqual([])
    expect(m.notificar).not.toHaveBeenCalled()
  })

  it('42501 (desvinculado desde la app): avisa y se para con código 0', async () => {
    const { f, cliente } = clienteFalso()
    await arrancar({ f, cliente })
    f.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'No es un agente vinculado' } })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(salidas).toEqual([0])
    expect(m.notificar).toHaveBeenCalledTimes(1)
    expect(m.notificar.mock.calls[0][1]).toMatch(/desvinculado/i)
  })

  it('42501 ya en el primer latido: se para', async () => {
    const { f, cliente } = clienteFalso()
    f.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'x' } })
    await arrancar({ f, cliente })
    expect(salidas).toEqual([0])
  })
})

describe('Puente en tiempo real', () => {
  it('escucha solo los INSERT del Puente de su dueño', async () => {
    const f = await arrancar(clienteFalso())
    expect(f.filtro).toEqual({ event: 'INSERT', schema: 'public', table: 'puente', filter: `user_id=eq.${DUENO}` })
    expect(f.canalNombre).toBe(`agente-${AGENTE}`)
  })

  it('un texto de otro dispositivo: lo copia TAL CUAL y avisa (escapado), primero copia', async () => {
    const f = await arrancar(clienteFalso())
    const texto = '$(rm -rf ~); <b>hola</b>'
    f.alCambio!({ new: { id: 'p1', user_id: DUENO, tipo: 'texto', contenido: texto, archivo_nombre: null, dispositivo: 'Móvil' } })
    await esperar()
    expect(m.copiar).toHaveBeenCalledWith(texto)
    expect(m.notificar).toHaveBeenCalledTimes(1)
    const [titulo, cuerpo] = m.notificar.mock.calls[0]
    expect(titulo).toBe('Puente · Móvil')
    expect(cuerpo).toContain('&lt;b&gt;hola&lt;/b&gt;')
    expect(m.copiar.mock.invocationCallOrder[0]).toBeLessThan(m.notificar.mock.invocationCallOrder[0])
  })

  it('lo que manda este mismo PC (mismo nombre) ni se copia ni se avisa', async () => {
    const f = await arrancar(clienteFalso({ fila: { user_id: DUENO, nombre: 'Sobremesa' } }))
    f.alCambio!({ new: { id: 'p2', tipo: 'texto', contenido: 'desde aquí', archivo_nombre: null, dispositivo: 'Sobremesa' } })
    await esperar()
    expect(m.copiar).not.toHaveBeenCalled()
    expect(m.notificar).not.toHaveBeenCalled()
  })

  it('usa el nombre que tiene ahora en la base de datos (no el de las credenciales)', async () => {
    const f = await arrancar(clienteFalso({ fila: { user_id: DUENO, nombre: 'Nuevo nombre' } }))
    f.alCambio!({ new: { id: 'p3', tipo: 'texto', contenido: 'x', archivo_nombre: null, dispositivo: 'PC casa' } })
    await esperar()
    expect(m.notificar).toHaveBeenCalled()
  })

  it('un archivo: avisa y no copia ni descarga nada', async () => {
    const f = await arrancar(clienteFalso())
    f.alCambio!({ new: { id: 'p4', tipo: 'archivo', contenido: '', archivo_nombre: 'foto.jpg', dispositivo: 'Móvil' } })
    await esperar()
    expect(m.copiar).not.toHaveBeenCalled()
    expect(m.notificar.mock.calls[0][1]).toContain('foto.jpg')
  })

  it('filas raras (sin tipo, contenido que no es texto, tipo desconocido): no hace nada', async () => {
    const f = await arrancar(clienteFalso())
    for (const fila of [{}, { tipo: 'texto' }, { tipo: 'texto', contenido: 42 }, { tipo: 'comando', contenido: 'reboot' }, { tipo: 1, contenido: 'x' }]) {
      f.alCambio!({ new: fila })
    }
    await esperar()
    expect(m.copiar).not.toHaveBeenCalled()
    expect(m.notificar).not.toHaveBeenCalled()
  })
})

describe('arranque y parada', () => {
  it('sin vincular: sale con 0 sin conectarse', async () => {
    m.credenciales = null
    // process.exit falso no sale: que pare aquí lanzando
    vi.mocked(process.exit).mockImplementation(((c?: number) => {
      salidas.push(c)
      throw new Error('salida')
    }) as typeof process.exit)
    const { f, cliente } = clienteFalso()
    m.cliente = cliente
    await expect(iniciarServicio()).rejects.toThrow('salida')
    expect(salidas).toEqual([0])
    expect(f.rpc).not.toHaveBeenCalled()
  })

  it('credenciales que ya no valen (Desvinculado): avisa y sale con 0', async () => {
    m.errorConectar = new Desvinculado('Este PC ya no está vinculado.')
    vi.mocked(process.exit).mockImplementation(((c?: number) => {
      salidas.push(c)
      throw new Error('salida')
    }) as typeof process.exit)
    await expect(iniciarServicio()).rejects.toThrow('salida')
    expect(salidas).toEqual([0])
    expect(m.notificar).toHaveBeenCalledTimes(1)
  })

  it('sin red al conectar: lanza (systemd lo reintenta) y no sale con 0', async () => {
    m.errorConectar = new Error('fetch failed')
    await expect(iniciarServicio()).rejects.toThrow('fetch failed')
    expect(salidas).toEqual([])
  })

  it('su fila ya no existe: sale con 0 sin latir', async () => {
    vi.mocked(process.exit).mockImplementation(((c?: number) => {
      salidas.push(c)
      throw new Error('salida')
    }) as typeof process.exit)
    const { f, cliente } = clienteFalso({ fila: null })
    m.cliente = cliente
    await expect(iniciarServicio()).rejects.toThrow('salida')
    expect(salidas).toEqual([0])
    expect(f.rpc).not.toHaveBeenCalled()
  })

  it('SIGTERM: deja de latir, quita el canal, cierra sesión y sale con 0', async () => {
    const f = await arrancar(clienteFalso())
    expect(manejadores.has('SIGTERM')).toBe(true)
    manejadores.get('SIGTERM')!()
    await esperar()
    expect(f.removeChannel).toHaveBeenCalled()
    expect(f.signOut).toHaveBeenCalled()
    expect(salidas).toEqual([0])
    const antes = f.rpc.mock.calls.length
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(f.rpc.mock.calls.length).toBe(antes)
  })
})
