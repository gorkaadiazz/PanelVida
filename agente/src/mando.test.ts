// mando.ts sin ejecutar nada: child_process falso. Comprueba que nunca se usa
// una shell, que las apps se lanzan separadas (detached + unref) y que los
// fallos llegan a quien llama.
import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const cp = vi.hoisted(() => ({
  execFile: vi.fn(),
  spawn: vi.fn(),
  exec: vi.fn(),
  execSync: vi.fn(),
  /** Lo que devuelve execFile: [error, stdout]. */
  respuesta: [null, ''] as [Error | null, string],
  /** Qué hace el hijo de spawn: 'spawn' o un error. */
  hijo: 'spawn' as 'spawn' | Error,
  unref: vi.fn(),
}))

vi.mock('node:child_process', async () => {
  const { promisify } = await import('node:util')
  const execFile = (programa: string, args: string[], opciones: unknown, cb: (e: Error | null, r?: { stdout: string; stderr: string }) => void) => {
    cp.execFile(programa, args, opciones)
    const [e, stdout] = cp.respuesta
    queueMicrotask(() => (e ? cb(e) : cb(null, { stdout, stderr: '' })))
  }
  // promisify(execFile) en Node devuelve { stdout, stderr }: se imita con custom
  ;(execFile as unknown as Record<symbol, unknown>)[promisify.custom] = (programa: string, args: string[], opciones: unknown) =>
    new Promise((ok, mal) => execFile(programa, args, opciones, (e, r) => (e ? mal(e) : ok(r))))
  const spawn = (programa: string, args: string[], opciones: unknown) => {
    cp.spawn(programa, args, opciones)
    const hijo = Object.assign(new EventEmitter(), { unref: cp.unref })
    queueMicrotask(() => (cp.hijo === 'spawn' ? hijo.emit('spawn') : hijo.emit('error', cp.hijo)))
    return hijo
  }
  return { execFile, spawn, exec: cp.exec, execSync: cp.execSync }
})

const { ejecutar, sesionGrafica, volumenActual } = await import('./mando.ts')
const { traducir } = await import('./lib/acciones.ts')

beforeEach(() => {
  cp.execFile.mockReset()
  cp.spawn.mockReset()
  cp.exec.mockReset()
  cp.unref.mockReset()
  cp.respuesta = [null, '']
  cp.hijo = 'spawn'
})

/** Ninguna llamada usa una shell. */
function sinShell() {
  expect(cp.exec).not.toHaveBeenCalled()
  expect(cp.execSync).not.toHaveBeenCalled()
  for (const [, , o] of [...cp.execFile.mock.calls, ...cp.spawn.mock.calls]) expect((o as { shell?: unknown } | undefined)?.shell).toBeFalsy()
}

describe('ejecutar', () => {
  it('una acción fija: execFile con el programa y los argumentos tal cual, con tiempo máximo', async () => {
    await ejecutar(traducir('volumen', '40', [], null)!)
    expect(cp.execFile).toHaveBeenCalledWith('wpctl', ['set-volume', '@DEFAULT_AUDIO_SINK@', '40%'], expect.objectContaining({ timeout: 10_000 }))
    expect(cp.spawn).not.toHaveBeenCalled()
    sinShell()
  })

  it('un argumento con caracteres de shell llega como UN argumento (no se interpreta)', async () => {
    await ejecutar({ programa: 'echo', args: ['$(rm -rf ~); `id` | sh'] })
    expect(cp.execFile.mock.calls[0][1]).toEqual(['$(rm -rf ~); `id` | sh'])
    sinShell()
  })

  it('una app: spawn separado (detached, sin stdio) y unref para no esperarla', async () => {
    const orden = traducir('abrir_app', 'Firefox', [{ nombre: 'Firefox', orden: ['firefox', '--new-window'] }], null)!
    await ejecutar(orden)
    expect(cp.spawn).toHaveBeenCalledWith('firefox', ['--new-window'], { detached: true, stdio: 'ignore' })
    expect(cp.unref).toHaveBeenCalledTimes(1)
    expect(cp.execFile).not.toHaveBeenCalled()
    sinShell()
  })

  it('una app que no existe: el error llega (ENOENT) y no se queda colgado', async () => {
    cp.hijo = Object.assign(new Error('spawn nada ENOENT'), { code: 'ENOENT' })
    await expect(ejecutar({ programa: 'nada', args: [], separado: true })).rejects.toMatchObject({ code: 'ENOENT' })
    expect(cp.unref).not.toHaveBeenCalled()
  })

  it('si la orden falla, el error llega a quien llama', async () => {
    cp.respuesta = [Object.assign(new Error('Command failed'), { code: 1 }), '']
    await expect(ejecutar({ programa: 'playerctl', args: ['next'] })).rejects.toThrow('Command failed')
  })
})

describe('sesionGrafica', () => {
  it('pregunta a loginctl por SU usuario y devuelve el id limpio', async () => {
    cp.respuesta = [null, '2\n']
    expect(await sesionGrafica()).toBe('2')
    const [programa, args] = cp.execFile.mock.calls[0]
    expect(programa).toBe('loginctl')
    expect(args).toEqual(['show-user', String(process.getuid!()), '-p', 'Display', '--value'])
    sinShell()
  })
  it('sin sesión gráfica (vacío) o si loginctl falla: null', async () => {
    cp.respuesta = [null, '\n']
    expect(await sesionGrafica()).toBeNull()
    cp.respuesta = [new Error('Failed to get user'), '']
    expect(await sesionGrafica()).toBeNull()
  })
})

describe('volumenActual', () => {
  it('lee wpctl get-volume', async () => {
    cp.respuesta = [null, 'Volume: 0.35 [MUTED]\n']
    expect(await volumenActual()).toEqual({ volumen: 35, silenciado: true })
    expect(cp.execFile.mock.calls[0].slice(0, 2)).toEqual(['wpctl', ['get-volume', '@DEFAULT_AUDIO_SINK@']])
  })
  it('sin PipeWire o con salida rara: null (el latido sigue)', async () => {
    cp.respuesta = [Object.assign(new Error('spawn wpctl ENOENT'), { code: 'ENOENT' }), '']
    expect(await volumenActual()).toBeNull()
    cp.respuesta = [null, 'basura']
    expect(await volumenActual()).toBeNull()
  })
})
