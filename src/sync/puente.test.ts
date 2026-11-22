// Puente móvil ⇄ PC de punta a punta: repositorio, motor, IndexedDB de
// mentira (uno por dispositivo) y el servidor falso. Storage y la sesión son
// de mentira: solo se comprueba QUÉ se le pide y en qué orden.

import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USUARIO = 'aaaaaaaa-0000-4000-8000-00000000000a'

const { almacen, actual } = vi.hoisted(() => ({
  almacen: {
    upload: null as unknown as (ruta: string, archivo: unknown, opciones: unknown) => Promise<{ error: unknown }>,
    remove: null as unknown as (rutas: string[]) => Promise<{ error: unknown }>,
    createSignedUrl: null as unknown as (ruta: string, s: number, o: unknown) => Promise<{ data: { signedUrl: string } | null; error: unknown }>,
  },
  actual: { sincronizar: null as null | (() => Promise<boolean>) },
}))

vi.mock('../lib/supabase', () => ({
  CLAVE_SESION: 'sb-prueba-auth-token',
  supabase: {
    storage: {
      from: (bucket: string) => {
        if (bucket !== 'puente') throw new Error(`bucket inesperado: ${bucket}`)
        return {
          upload: (...a: Parameters<typeof almacen.upload>) => almacen.upload(...a),
          remove: (...a: Parameters<typeof almacen.remove>) => almacen.remove(...a),
          createSignedUrl: (...a: Parameters<typeof almacen.createSignedUrl>) => almacen.createSignedUrl(...a),
        }
      },
    },
  },
}))
vi.mock('../lib/auth', () => ({ sesionGuardada: () => ({ user: { id: USUARIO } }) }))
vi.mock('./sesion', () => ({ sincronizarAhora: () => actual.sincronizar?.() ?? Promise.resolve(false) }))

import { ErrorNoEncontrado } from '../repos/base'
import {
  borrarElemento,
  cambiarNombreDispositivo,
  enlaceDescarga,
  enviarArchivo,
  enviarTexto,
  fijarElemento,
  listarPuente,
  nombreDispositivo,
} from '../repos/puente'
import { ErrorDeValidacion } from '../lib/validacion'
import { estadoSync, reiniciarEstado } from './avisos'
import { abrirBase, usarBase, type BaseLocal } from './bd'
import { contarPendientes } from './cola'
import { crearMotor, type Motor } from './motor'
import { crearServidorFalso, type ServidorFalso } from './servidorFalso'
import { TABLAS } from './tablas'

let abiertas: BaseLocal[] = []
const navegador = { onLine: true, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0' }

interface Dispositivo {
  base: BaseLocal
  red: { conectada: boolean }
  motor: Motor
  usar(): void
}

async function dispositivo(servidor: ServidorFalso): Promise<Dispositivo> {
  vi.stubGlobal('indexedDB', new IDBFactory())
  const base = await abrirBase('usuario-1')
  abiertas.push(base)
  const red = { conectada: true }
  const motor = crearMotor({ base, remoto: servidor, enLinea: () => red.conectada })
  const d: Dispositivo = {
    base,
    red,
    motor,
    usar: () => {
      usarBase(Promise.resolve(base))
      actual.sincronizar = () => motor.sincronizar()
      navegador.onLine = red.conectada
    },
  }
  d.usar()
  return d
}

async function sincronizar(d: Dispositivo) {
  d.usar()
  return d.motor.sincronizar()
}

/** localStorage de mentira (el nombre del dispositivo vive ahí). */
function almacenLocal() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  }
}

const hora = (iso: string) => vi.setSystemTime(new Date(iso))

async function hasta(condicion: () => boolean, que: string) {
  for (let i = 0; i < 200; i++) {
    if (condicion()) return
    await new Promise((ok) => setTimeout(ok, 5))
  }
  throw new Error(`No ha llegado a cumplirse: ${que}`)
}
/** Un archivo de mentira: validarArchivo y el repositorio solo miran nombre, tipo y tamaño. */
const archivo = (name: string, size: number, type = 'application/pdf') => ({ name, size, type }) as unknown as File

beforeEach(() => {
  reiniciarEstado()
  vi.useFakeTimers({ toFake: ['Date'] })
  hora('2026-11-22T10:00:00.000Z')
  navegador.onLine = true
  vi.stubGlobal('navigator', navegador)
  vi.stubGlobal('localStorage', almacenLocal())
  almacen.upload = vi.fn(async () => ({ error: null }))
  almacen.remove = vi.fn(async () => ({ error: null }))
  almacen.createSignedUrl = vi.fn(async (ruta: string) => ({ data: { signedUrl: `https://firmado/${ruta}` }, error: null }))
  actual.sincronizar = null
})

afterEach(() => {
  for (const base of abiertas) base.cerrar()
  abiertas = []
  usarBase(null)
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('la tabla puente en la sincronización', () => {
  it('está declarada, se sube y no es de solo lectura; sube todas las columnas que usa la app', () => {
    const def = TABLAS.find((t) => t.nombre === 'puente') as { columnas: readonly string[]; soloLectura?: boolean } | undefined
    expect(def).toBeDefined()
    expect(def?.soloLectura ?? false).toBe(false)
    expect([...(def?.columnas ?? [])].sort()).toEqual(
      ['archivo_bytes', 'archivo_nombre', 'archivo_ruta', 'archivo_tipo', 'contenido', 'dispositivo', 'fijado', 'tipo'].sort(),
    )
  })
})

describe('texto y enlaces', () => {
  it('se crea sin conexión, sube al volver la red y baja al otro dispositivo con su nombre y hora', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    const movil = await dispositivo(servidor)

    pc.usar()
    cambiarNombreDispositivo('  PC   casa ')
    pc.red.conectada = false
    pc.usar()
    const e = await enviarTexto('   https://ejemplo.com/a?b=1   ')
    expect(e).toMatchObject({ tipo: 'enlace', contenido: 'https://ejemplo.com/a?b=1', dispositivo: 'PC casa', fijado: false })
    expect(await sincronizar(pc)).toBe(false)
    expect(await contarPendientes(pc.base)).toBe(1)
    expect(servidor.filas('puente')).toEqual([])

    pc.red.conectada = true
    expect(await sincronizar(pc)).toBe(true)
    expect(await contarPendientes(pc.base)).toBe(0)
    expect(servidor.fila('puente', e.id)).toMatchObject({
      tipo: 'enlace',
      contenido: 'https://ejemplo.com/a?b=1',
      dispositivo: 'PC casa',
      archivo_ruta: null,
      created_at: e.created_at,
    })

    expect(await sincronizar(movil)).toBe(true)
    movil.usar()
    const enMovil = await listarPuente()
    expect(enMovil).toHaveLength(1)
    expect(enMovil[0]).toMatchObject({ id: e.id, tipo: 'enlace', dispositivo: 'PC casa', created_at: e.created_at })
    expect(enMovil[0].sync_at).toBeTruthy()
  })

  it('varios textos sin conexión suben todos y en el otro lado salen los dos', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    const movil = await dispositivo(servidor)
    pc.red.conectada = false
    pc.usar()
    await enviarTexto('uno')
    hora('2026-11-22T10:00:01.000Z')
    await enviarTexto('  if (x) {\n    y()\n  }\n')
    expect(await contarPendientes(pc.base)).toBe(2)
    pc.red.conectada = true
    expect(await sincronizar(pc)).toBe(true)
    await sincronizar(movil)
    movil.usar()
    const contenidos = (await listarPuente()).map((x) => x.contenido).sort()
    expect(contenidos).toEqual(['  if (x) {\n    y()\n  }', 'uno'].sort())
  })

  it('lo vacío o demasiado largo no se guarda ni se encola', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    await expect(enviarTexto('  \n ')).rejects.toThrow(ErrorDeValidacion)
    await expect(enviarTexto('x'.repeat(10001))).rejects.toThrow(ErrorDeValidacion)
    expect(await listarPuente()).toEqual([])
    expect(await contarPendientes(pc.base)).toBe(0)
  })

  it('un nombre de dispositivo con emojis no hace que el servidor rechace lo que se manda', async () => {
    const servidor = crearServidorFalso()
    // Como Postgres: un surrogate suelto no es JSON válido
    servidor.rechazar = (_t, fila) => (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(JSON.stringify(fila)) ? '22P02' : null)
    const pc = await dispositivo(servidor)
    cambiarNombreDispositivo(`a${'📱'.repeat(30)}`)
    const e = await enviarTexto('hola')
    expect(await sincronizar(pc)).toBe(true)
    expect(servidor.fila('puente', e.id)).toBeDefined()
    expect(estadoSync().rechazados).toBe(0)
  })
})

describe('borrar y fijar entre dispositivos', () => {
  it('lo borrado desde otro dispositivo (o por la limpieza de los 7 días) desaparece de la copia local', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    const e = await enviarTexto('se va a borrar')
    await sincronizar(pc)

    hora('2026-11-22T10:05:00.000Z')
    servidor.borrarDesdeOtroDispositivo('puente', e.id)
    expect(await sincronizar(pc)).toBe(true)
    pc.usar()
    expect(await listarPuente()).toEqual([])
    // Y ya no se puede fijar: avisa en vez de revivirlo
    await expect(fijarElemento(e.id, true)).rejects.toBeInstanceOf(ErrorNoEncontrado)
    expect(await contarPendientes(pc.base)).toBe(0)
  })

  it('fijarlo sin conexión cuando otro ya lo había borrado no lo revive', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    const movil = await dispositivo(servidor)
    pc.usar()
    const e = await enviarTexto('carrera')
    await sincronizar(pc)
    await sincronizar(movil)

    movil.red.conectada = false
    movil.usar()
    hora('2026-11-22T10:01:00.000Z')
    await fijarElemento(e.id, true)

    pc.usar()
    hora('2026-11-22T10:02:00.000Z')
    await borrarElemento(e.id)
    await sincronizar(pc)
    expect(servidor.filas('puente')).toEqual([])

    movil.red.conectada = true
    await sincronizar(movil)
    expect(servidor.filas('puente')).toEqual([])
    movil.usar()
    expect(await listarPuente()).toEqual([])
    expect(await contarPendientes(movil.base)).toBe(0)
  })

  it('fijar sube y llega al otro; soltarlo después también (gana el cambio más reciente)', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    const movil = await dispositivo(servidor)
    pc.usar()
    const e = await enviarTexto('importante')
    await sincronizar(pc)
    await sincronizar(movil)

    movil.usar()
    hora('2026-11-22T10:01:00.000Z')
    expect((await fijarElemento(e.id, true)).fijado).toBe(true)
    await sincronizar(movil)
    expect(servidor.fila('puente', e.id)?.fijado).toBe(true)

    await sincronizar(pc)
    pc.usar()
    expect((await listarPuente())[0].fijado).toBe(true)

    hora('2026-11-22T10:02:00.000Z')
    await fijarElemento(e.id, false)
    await sincronizar(pc)
    await sincronizar(movil)
    movil.usar()
    expect((await listarPuente())[0]).toMatchObject({ fijado: false, contenido: 'importante', created_at: e.created_at })
  })

  it('fijar no cambia la hora de creación (la caducidad de 7 días se cuenta desde que se mandó)', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    const e = await enviarTexto('x')
    await sincronizar(pc)
    hora('2026-11-25T10:00:00.000Z')
    const fijado = await fijarElemento(e.id, true)
    expect(fijado.created_at).toBe(e.created_at)
    await sincronizar(pc)
    expect(servidor.fila('puente', e.id)?.created_at).toBe(e.created_at)
  })
})

describe('archivos', () => {
  it('la fila llega al servidor ANTES de subir el archivo, a la ruta {usuario}/{fila}/{nombre}', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    const movil = await dispositivo(servidor)
    pc.usar()
    const orden: string[] = []
    almacen.upload = vi.fn(async (ruta: string) => {
      orden.push(servidor.filas('puente').some((f) => f.archivo_ruta === ruta) ? 'subida con fila' : 'subida SIN fila')
      return { error: null }
    })

    const e = await enviarArchivo(archivo('Foto de la playa ñ (1).JPG', 1234, 'image/jpeg'))
    expect(orden).toEqual(['subida con fila'])
    expect(e.archivo_ruta).toBe(`${USUARIO}/${e.id}/Foto-de-la-playa-n-1-.JPG`)
    expect(almacen.upload).toHaveBeenCalledWith(e.archivo_ruta, expect.anything(), expect.objectContaining({ upsert: false, contentType: 'image/jpeg' }))
    expect(servidor.fila('puente', e.id)).toMatchObject({
      tipo: 'archivo',
      contenido: '',
      archivo_nombre: 'Foto de la playa ñ (1).JPG',
      archivo_tipo: 'image/jpeg',
      archivo_bytes: 1234,
    })

    await sincronizar(movil)
    movil.usar()
    const [enMovil] = await listarPuente()
    expect(enMovil).toMatchObject({ id: e.id, archivo_ruta: e.archivo_ruta })
    expect(await enlaceDescarga(enMovil)).toBe(`https://firmado/${e.archivo_ruta}`)
    expect(almacen.createSignedUrl).toHaveBeenCalledWith(e.archivo_ruta, 60, { download: 'Foto de la playa ñ (1).JPG' })
  })

  it('sin conexión no deja mandar un archivo ni crea nada', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    pc.red.conectada = false
    pc.usar()
    await expect(enviarArchivo(archivo('a.pdf', 10))).rejects.toThrow('hace falta conexión')
    expect(await listarPuente()).toEqual([])
    expect(await contarPendientes(pc.base)).toBe(0)
    expect(almacen.upload).not.toHaveBeenCalled()
  })

  it('vacío o de más de 25 MB no se manda (el de 25 MB justos, sí)', async () => {
    const servidor = crearServidorFalso()
    await dispositivo(servidor)
    await expect(enviarArchivo(archivo('a.pdf', 0))).rejects.toThrow('vacío')
    await expect(enviarArchivo(archivo('a.pdf', 25 * 1024 * 1024 + 1))).rejects.toThrow('25 MB')
    expect(almacen.upload).not.toHaveBeenCalled()
    await expect(enviarArchivo(archivo('a.pdf', 25 * 1024 * 1024))).resolves.toMatchObject({ archivo_bytes: 25 * 1024 * 1024 })
  })

  it('si el servidor rechaza la fila (tope de 300 MB), no se sube el archivo y la fila desaparece', async () => {
    const servidor = crearServidorFalso()
    servidor.rechazar = (tabla, fila) => (tabla === 'puente' && fila.tipo === 'archivo' ? '23514' : null)
    const pc = await dispositivo(servidor)
    await expect(enviarArchivo(archivo('grande.zip', 1000))).rejects.toThrow(ErrorDeValidacion)
    expect(almacen.upload).not.toHaveBeenCalled()
    expect(await listarPuente()).toEqual([])
    expect(await contarPendientes(pc.base)).toBe(0)
    expect(servidor.filas('puente')).toEqual([])
  })

  it('si la subida falla, la fila se borra aquí y, al sincronizar, también en el servidor', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    const movil = await dispositivo(servidor)
    pc.usar()
    almacen.upload = vi.fn(async () => ({ error: { message: 'cortado' } }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(enviarArchivo(archivo('a.pdf', 10))).rejects.toThrow('No se ha podido subir')
    expect(await listarPuente()).toEqual([])
    expect(servidor.filas('puente')).toHaveLength(1) // aún no se ha sincronizado el borrado
    await sincronizar(pc)
    expect(servidor.filas('puente')).toEqual([])
    await sincronizar(movil)
    movil.usar()
    expect(await listarPuente()).toEqual([])
  })

  it('borrar un archivo con conexión: primero desaparece la fila del servidor y después el archivo de Storage', async () => {
    const servidor = crearServidorFalso()
    await dispositivo(servidor)
    const a = await enviarArchivo(archivo('a.pdf', 10))
    const orden: string[] = []
    almacen.remove = vi.fn(async (rutas: string[]) => {
      orden.push(servidor.filas('puente').some((f) => rutas.includes(String(f.archivo_ruta))) ? 'archivo con fila' : 'archivo sin fila')
      return { error: null }
    })

    await borrarElemento(a.id)
    expect(await listarPuente()).toEqual([]) // la pantalla no espera a la red
    await hasta(() => vi.mocked(almacen.remove).mock.calls.length === 1, 'se borra el archivo')
    expect(almacen.remove).toHaveBeenCalledWith([a.archivo_ruta])
    expect(orden).toEqual(['archivo sin fila'])
    expect(servidor.filas('puente')).toEqual([])
  })

  it('borrar un archivo sin conexión borra solo la fila (el archivo lo barre la limpieza) y sube al volver', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    const b = await enviarArchivo(archivo('b.pdf', 10))
    pc.red.conectada = false
    pc.usar()
    await borrarElemento(b.id)
    expect(await listarPuente()).toEqual([])
    expect(await contarPendientes(pc.base)).toBe(1)
    pc.red.conectada = true
    await sincronizar(pc)
    expect(servidor.filas('puente')).toEqual([])
    expect(almacen.remove).not.toHaveBeenCalled()
  })

  it('si Storage no deja borrar el archivo, la fila se borra igualmente', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    const a = await enviarArchivo(archivo('a.pdf', 10))
    almacen.remove = vi.fn(async () => ({ error: { message: 'no' } }))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await borrarElemento(a.id)
    await hasta(() => vi.mocked(almacen.remove).mock.calls.length === 1, 'se intenta borrar el archivo')
    await sincronizar(pc)
    expect(servidor.filas('puente')).toEqual([])
  })

  it('descargar: sin conexión avisa; sin archivo o si Storage no lo encuentra, ErrorNoEncontrado', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    const a = await enviarArchivo(archivo('a.pdf', 10))
    const t = await enviarTexto('texto')
    await expect(enlaceDescarga(t)).rejects.toBeInstanceOf(ErrorNoEncontrado)
    almacen.createSignedUrl = vi.fn(async () => ({ data: null, error: { message: 'Object not found' } }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(enlaceDescarga(a)).rejects.toBeInstanceOf(ErrorNoEncontrado)
    pc.red.conectada = false
    pc.usar()
    await expect(enlaceDescarga(a)).rejects.toThrow('hace falta conexión')
  })
})

describe('nombre del dispositivo', () => {
  it('por defecto lo adivina; se guarda limpio y, vacío, vuelve al de por defecto', async () => {
    expect(nombreDispositivo()).toBe('PC')
    expect(cambiarNombreDispositivo('  PC   clase  ')).toBe('PC clase')
    expect(nombreDispositivo()).toBe('PC clase')
    expect(cambiarNombreDispositivo('   ')).toBe('PC')
  })

  it('sin localStorage usa el de por defecto y avisa al cambiarlo', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      },
    })
    expect(nombreDispositivo()).toBe('PC')
    expect(() => cambiarNombreDispositivo('Móvil')).toThrow(ErrorDeValidacion)
  })
})
