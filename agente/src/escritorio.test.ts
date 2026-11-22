// escritorio.ts sin tocar el escritorio de verdad: child_process falso.
// Se comprueba que nunca hay shell, que el texto del Puente va por stdin a
// wl-copy (o como UN argumento a qdbus6) y que notify-send lleva `--`.
import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Llamada = { programa: string; args: string[]; opciones: Record<string, unknown> | undefined }

const cp = vi.hoisted(() => {
  const estado = {
    llamadas: [] as { programa: string; args: string[]; opciones: Record<string, unknown> | undefined }[],
    // Qué programas «existen» (para `which`) y cuáles fallan
    existen: new Set<string>(),
    fallan: new Set<string>(),
    salida: '' as string,
    codigoWlCopy: 0 as number | null,
    errorWlCopy: false,
    stdinWlCopy: [] as string[],
  }
  return estado
})

vi.mock('node:child_process', () => {
  const prohibido = (nombre: string) => () => {
    throw new Error(`escritorio.ts no debe usar ${nombre}`)
  }
  const execFile = vi.fn((programa: string, args: string[], opciones: Record<string, unknown>, cb: (e: Error | null, r?: { stdout: string; stderr: string }) => void) => {
    cp.llamadas.push({ programa, args, opciones })
    if (programa === 'which') {
      return cb(cp.existen.has(args[0]) ? null : new Error('no está'), { stdout: '', stderr: '' })
    }
    if (cp.fallan.has(programa)) return cb(new Error(`${programa} falla`))
    cb(null, { stdout: cp.salida, stderr: '' })
  })
  const spawn = vi.fn((programa: string, args: string[], opciones: Record<string, unknown>) => {
    cp.llamadas.push({ programa, args, opciones })
    const hijo = new EventEmitter() as EventEmitter & { stdin: { end: (t: string) => void } }
    hijo.stdin = {
      end: (t: string) => {
        cp.stdinWlCopy.push(t)
        queueMicrotask(() => (cp.errorWlCopy ? hijo.emit('error', new Error('ENOENT')) : hijo.emit('close', cp.codigoWlCopy)))
      },
    }
    return hijo
  })
  return { execFile, spawn, exec: prohibido('exec'), execSync: prohibido('execSync'), spawnSync: prohibido('spawnSync'), execFileSync: prohibido('execFileSync'), fork: prohibido('fork') }
})

const { copiar, leerPortapapeles, notificar } = await import('./escritorio.ts')

const MALICIOSO = `"; rm -rf ~; echo "$(reboot)" \`id\` | sh && \n--help -e '<b>x</b>' \0 ${'x'.repeat(50)}`

function sinShell(llamadas: Llamada[]) {
  for (const l of llamadas) {
    expect(['sh', 'bash', 'zsh', 'fish', 'dash', '/bin/sh', 'env']).not.toContain(l.programa)
    expect(l.opciones?.shell ?? false).toBe(false)
    expect(Array.isArray(l.args)).toBe(true)
  }
}

beforeEach(() => {
  cp.llamadas.length = 0
  cp.existen = new Set()
  cp.fallan = new Set()
  cp.salida = ''
  cp.codigoWlCopy = 0
  cp.errorWlCopy = false
  cp.stdinWlCopy.length = 0
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('notificar', () => {
  it('notify-send con `--` antes del título y el cuerpo, cada uno un argumento', async () => {
    await notificar('--help', MALICIOSO)
    expect(cp.llamadas).toHaveLength(1)
    const { programa, args } = cp.llamadas[0]
    expect(programa).toBe('notify-send')
    const separador = args.indexOf('--')
    expect(separador).toBeGreaterThanOrEqual(0)
    expect(args.slice(separador + 1)).toEqual(['--help', MALICIOSO])
    // Antes de `--` solo opciones fijas (nada que venga de fuera)
    expect(args.slice(0, separador).every((a) => a.startsWith('--') && !a.includes(MALICIOSO))).toBe(true)
    sinShell(cp.llamadas)
  })

  it('si notify-send falla, no lanza', async () => {
    cp.fallan.add('notify-send')
    await expect(notificar('t', 'c')).resolves.toBeUndefined()
  })

  it('pone un tiempo máximo', async () => {
    await notificar('t', 'c')
    expect(cp.llamadas[0].opciones?.timeout).toBeGreaterThan(0)
  })
})

describe('copiar', () => {
  it('con wl-copy: el texto va por stdin, sin argumentos y sin shell', async () => {
    cp.existen.add('wl-copy')
    await expect(copiar(MALICIOSO)).resolves.toBe(true)
    const wl = cp.llamadas.find((l) => l.programa === 'wl-copy')!
    expect(wl.args).toEqual([])
    expect(cp.stdinWlCopy).toEqual([MALICIOSO])
    expect(cp.llamadas.some((l) => l.args.includes(MALICIOSO))).toBe(false)
    expect(cp.llamadas.find((l) => l.programa === 'which')?.args).toEqual(['wl-copy'])
    sinShell(cp.llamadas)
  })

  it('wl-copy que acaba con error o no arranca: false', async () => {
    cp.existen.add('wl-copy')
    cp.codigoWlCopy = 1
    await expect(copiar('x')).resolves.toBe(false)
    cp.codigoWlCopy = null
    await expect(copiar('x')).resolves.toBe(false)
    cp.codigoWlCopy = 0
    cp.errorWlCopy = true
    await expect(copiar('x')).resolves.toBe(false)
  })

  it('sin wl-copy: Klipper por qdbus6 con el texto como UN solo argumento (el último)', async () => {
    await expect(copiar(MALICIOSO)).resolves.toBe(true)
    const q = cp.llamadas.find((l) => l.programa === 'qdbus6')!
    expect(q.args).toEqual(['org.kde.klipper', '/klipper', 'setClipboardContents', MALICIOSO])
    expect(cp.llamadas.some((l) => l.programa === 'wl-copy')).toBe(false)
    sinShell(cp.llamadas)
  })

  it('un texto que parece una opción (-e, --help) sigue siendo el argumento del texto', async () => {
    await copiar('--help')
    expect(cp.llamadas.find((l) => l.programa === 'qdbus6')!.args.at(-1)).toBe('--help')
  })

  it('sin wl-copy y qdbus6 falla: false, sin lanzar', async () => {
    cp.fallan.add('qdbus6')
    await expect(copiar('x')).resolves.toBe(false)
  })
})

describe('leerPortapapeles', () => {
  it('wl-paste sin shell y devuelve lo leído tal cual', async () => {
    cp.existen.add('wl-paste')
    cp.salida = 'hola\n'
    await expect(leerPortapapeles()).resolves.toBe('hola\n')
    const wl = cp.llamadas.find((l) => l.programa === 'wl-paste')!
    expect(wl.args).toEqual(['--no-newline', '--type', 'text'])
    expect(wl.opciones?.maxBuffer).toBeGreaterThan(0)
    sinShell(cp.llamadas)
  })
  it('Klipper: quita solo el salto de línea final que añade qdbus', async () => {
    cp.salida = 'a\nb\n\n'
    await expect(leerPortapapeles()).resolves.toBe('a\nb\n')
  })
  it('si nada funciona: null', async () => {
    cp.fallan.add('qdbus6')
    await expect(leerPortapapeles()).resolves.toBeNull()
  })
})
