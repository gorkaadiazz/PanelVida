// red.ts sin tocar la red: dgram, child_process y el oui.csv falsos.
// Lo importante: si el router no es el de config.json, NO se barre la red
// (solo se pregunta por el router), y nunca se usa una shell.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ROUTER_MAC = '74:00:00:00:00:02'

const f = vi.hoisted(() => ({
  ip: vi.fn<(args: string[]) => void>(),
  enviados: [] as string[],
  cerrado: 0,
  opciones: [] as unknown[],
  ruta: '',
  dir: '',
  /** Tabla de vecinos: antes y después del barrido. */
  vecinosAntes: '',
  vecinosDespues: '',
  barrido: false,
  link: '',
  oui: null as string | null,
  lecturasOui: 0,
}))

vi.mock('node:child_process', async () => {
  const { promisify } = await import('node:util')
  const responder = (args: string[]) => {
    f.ip(args)
    if (args.includes('route')) return f.ruta
    if (args.includes('addr')) return f.dir
    if (args.includes('neigh')) return f.barrido ? f.vecinosDespues : f.vecinosAntes
    if (args.includes('link')) return f.link
    return ''
  }
  const execFile = (programa: string, args: string[], opciones: unknown, cb: (e: Error | null, r?: { stdout: string }) => void) => {
    f.opciones.push(opciones)
    if (programa !== 'ip') return cb(new Error(`programa inesperado ${programa}`))
    queueMicrotask(() => cb(null, { stdout: responder(args) }))
  }
  ;(execFile as unknown as Record<symbol, unknown>)[promisify.custom] = (programa: string, args: string[], opciones: unknown) =>
    new Promise((ok, mal) => execFile(programa, args, opciones, (e, r) => (e ? mal(e) : ok({ ...r, stderr: '' }))))
  return { execFile, exec: () => { throw new Error('nunca una shell') }, spawn: () => { throw new Error('no se lanza nada') } }
})

vi.mock('node:dgram', () => ({
  createSocket: (tipo: string) => {
    expect(tipo).toBe('udp4')
    return {
      on: () => {},
      send: (buf: Buffer, puerto: number, destino: string, cb: () => void) => {
        expect(buf.length).toBe(0)
        expect(puerto).toBe(9)
        f.enviados.push(destino)
        // Tocar una IP que no es la del router es el barrido: desde ahí la tabla ya tiene a todos
        if (destino !== (JSON.parse(f.ruta || '[{}]')[0] ?? {}).gateway) f.barrido = true
        queueMicrotask(cb)
      },
      close: () => {
        f.cerrado++
      },
    }
  },
}))

vi.mock('node:fs/promises', () => ({
  readFile: async () => {
    f.lecturasOui++
    if (f.oui === null) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    return f.oui
  },
}))

const { escanear, routerActual } = await import('./red.ts')

const vecino = (ip: string, mac: string, state = 'REACHABLE') => ({ dst: ip, dev: 'wlan0', lladdr: mac, state: [state] })

beforeEach(() => {
  vi.useFakeTimers()
  f.ip.mockReset()
  f.enviados = []
  f.cerrado = 0
  f.opciones = []
  f.barrido = false
  f.ruta = '[{"dst":"default","gateway":"192.168.1.1","dev":"wlan0","protocol":"dhcp","metric":600,"flags":[]}]'
  f.dir = '[{"ifname":"wlan0","addr_info":[{"family":"inet","local":"192.168.1.104","prefixlen":24}]}]'
  f.vecinosAntes = JSON.stringify([vecino('192.168.1.1', ROUTER_MAC)])
  f.vecinosDespues = JSON.stringify([
    vecino('192.168.1.1', ROUTER_MAC),
    vecino('192.168.1.34', 'f4:bd:9e:00:00:01', 'STALE'),
    vecino('192.168.1.40', 'da:a1:19:00:00:01'),
    vecino('192.168.1.41', '00:11:22:00:00:09', 'FAILED'),
  ])
  f.link = '[{"ifname":"wlan0","address":"f4:4e:00:00:00:bb","broadcast":"ff:ff:ff:ff:ff:ff"}]'
  f.oui = 'Registry,Assignment,Organization Name,Organization Address\r\nMA-L,F4BD9E,"Cisco Systems, Inc",San Jose\r\nMA-L,DAA119,No se usa (aleatoria),x\r\n'
})

afterEach(() => {
  vi.useRealTimers()
})

async function correr<T>(p: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync()
  return p
}

describe('escanear: solo en casa', () => {
  it('sin macRouter no hace NADA (ni ip ni paquetes)', async () => {
    expect(await correr(escanear(null))).toBeNull()
    expect(f.ip).not.toHaveBeenCalled()
    expect(f.enviados).toEqual([])
  })

  it('si el router NO es el de config.json: solo se pregunta por el router y NO se barre la red', async () => {
    expect(await correr(escanear('74:00:00:00:00:99'))).toBeNull()
    expect(f.enviados).toEqual(['192.168.1.1'])
    expect(f.barrido).toBe(false)
    // ni se lee el oui ni la MAC propia
    expect(f.ip.mock.calls.some(([a]) => a.includes('link'))).toBe(false)
  })

  it('misma IP de router pero sin él en la tabla (no contesta): no se barre', async () => {
    f.vecinosAntes = '[]'
    expect(await correr(escanear(ROUTER_MAC))).toBeNull()
    expect(f.enviados).toEqual(['192.168.1.1'])
  })

  it('router con entrada vieja (STALE) que no se confirma: lo reintenta 3 veces y NO barre', async () => {
    f.vecinosAntes = JSON.stringify([vecino('192.168.1.1', ROUTER_MAC, 'STALE')])
    expect(await correr(escanear(ROUTER_MAC))).toBeNull()
    expect(f.enviados).toEqual(['192.168.1.1', '192.168.1.1', '192.168.1.1'])
    expect(f.barrido).toBe(false)
  })

  it('el router en FAILED o INCOMPLETE (otra red con la misma IP): fuera a la primera', async () => {
    for (const estado of ['FAILED', 'INCOMPLETE']) {
      f.enviados = []
      f.vecinosAntes = JSON.stringify([{ dst: '192.168.1.1', dev: 'wlan0', ...(estado === 'FAILED' ? { lladdr: ROUTER_MAC } : {}), state: [estado] }])
      expect(await correr(escanear(ROUTER_MAC))).toBeNull()
      expect(f.enviados).toEqual(['192.168.1.1'])
    }
  })

  it('la MAC del router en OTRA IP no cuenta como casa', async () => {
    f.vecinosAntes = JSON.stringify([vecino('192.168.1.1', '74:00:00:00:00:99'), vecino('192.168.1.50', ROUTER_MAC)])
    expect(await correr(escanear(ROUTER_MAC))).toBeNull()
    expect(f.enviados).toHaveLength(1)
  })

  it('sin ruta por defecto (sin red) o sin IPv4: null sin mandar nada', async () => {
    f.ruta = '[]'
    expect(await correr(escanear(ROUTER_MAC))).toBeNull()
    f.ruta = '[{"dst":"default","gateway":"192.168.1.1","dev":"wlan0"}]'
    f.dir = '[{}]'
    expect(await correr(escanear(ROUTER_MAC))).toBeNull()
    expect(f.enviados).toEqual([])
  })

  it('en casa: barre SOLO tu /24 (sin red, difusión ni tu IP) y devuelve los aparatos con fabricante', async () => {
    const r = await correr(escanear(ROUTER_MAC))
    const barrido = f.enviados.slice(1)
    expect(barrido).toHaveLength(253)
    expect(barrido.every((ip) => /^192\.168\.1\.\d+$/.test(ip))).toBe(true)
    expect(barrido).not.toContain('192.168.1.0')
    expect(barrido).not.toContain('192.168.1.255')
    expect(barrido).not.toContain('192.168.1.104')
    expect(r).toEqual({
      dispositivos: [
        { mac: ROUTER_MAC, ip: '192.168.1.1', fabricante: null },
        { mac: 'f4:bd:9e:00:00:01', ip: '192.168.1.34', fabricante: 'Cisco Systems, Inc' },
        { mac: 'da:a1:19:00:00:01', ip: '192.168.1.40', fabricante: null }, // aleatoria: sin fabricante
        { mac: 'f4:4e:00:00:00:bb', ip: '192.168.1.104', fabricante: null }, // este PC
      ],
    })
    expect(f.cerrado).toBeGreaterThanOrEqual(2) // cada socket se cierra
  })

  it('una red /16 se limita a tu /24', async () => {
    f.dir = '[{"addr_info":[{"family":"inet","local":"10.0.5.7","prefixlen":16}]}]'
    f.ruta = '[{"dst":"default","gateway":"10.0.0.1","dev":"eth0"}]'
    f.vecinosAntes = JSON.stringify([vecino('10.0.0.1', ROUTER_MAC)])
    f.vecinosDespues = f.vecinosAntes
    await correr(escanear(ROUTER_MAC))
    expect(f.enviados.slice(1).every((ip) => ip.startsWith('10.0.5.'))).toBe(true)
    expect(f.enviados).toHaveLength(254)
  })

  it('la interfaz va a ip como argumento suelto; siempre execFile con tiempo y tope de salida', async () => {
    await correr(escanear(ROUTER_MAC))
    for (const [args] of f.ip.mock.calls) expect(args.slice(0, 1)).toEqual(['-j'])
    expect(f.ip.mock.calls.filter(([a]) => a.includes('neigh')).every(([a]) => a.join(' ').endsWith('dev wlan0'))).toBe(true)
    for (const o of f.opciones) expect(o).toMatchObject({ timeout: 5000, maxBuffer: 2 * 1024 * 1024 })
  })

  it('sin la MAC propia (link raro) sigue con lo demás', async () => {
    f.link = 'no es json'
    const r = await correr(escanear(ROUTER_MAC))
    expect(r?.dispositivos).toHaveLength(3)
  })

  it('como mucho 512 aparatos', async () => {
    f.dir = '[{"addr_info":[{"family":"inet","local":"10.0.5.7","prefixlen":24}]}]'
    f.ruta = '[{"dst":"default","gateway":"10.0.5.1","dev":"eth0"}]'
    f.vecinosAntes = JSON.stringify([vecino('10.0.5.1', ROUTER_MAC)])
    f.vecinosDespues = JSON.stringify(
      Array.from({ length: 700 }, (_, i) => vecino(`10.${Math.floor(i / 250)}.${i % 250}.1`, `00:11:22:00:${(i >> 8).toString(16).padStart(2, '0')}:${(i & 255).toString(16).padStart(2, '0')}`)),
    )
    const r = await correr(escanear(ROUTER_MAC))
    expect(r?.dispositivos).toHaveLength(512)
  })
})

describe('routerActual (mipanel-agente red)', () => {
  it('da la IP, la interfaz y la MAC del router; solo toca al router', async () => {
    expect(await correr(routerActual())).toEqual({ ip: '192.168.1.1', dev: 'wlan0', mac: ROUTER_MAC })
    expect(f.enviados).toEqual(['192.168.1.1'])
  })
  it('sin red: null', async () => {
    f.ruta = ''
    expect(await correr(routerActual())).toBeNull()
  })
  it('el router no contesta: MAC null', async () => {
    f.vecinosAntes = '[]'
    expect(await correr(routerActual())).toEqual({ ip: '192.168.1.1', dev: 'wlan0', mac: null })
  })
})
