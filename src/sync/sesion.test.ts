// Sesión + sincronización: arranque al iniciar sesión, cierre de sesión que
// borra siempre la copia local y cambio de usuario. Navegador de mentira
// (window, document, navigator), IndexedDB de mentira y servidor de mentira.

import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { servidorActual, salir } = vi.hoisted(() => ({
  servidorActual: { valor: null as unknown },
  salir: vi.fn(async () => {}),
}))

vi.mock('../lib/supabase', () => ({ supabase: {}, CLAVE_SESION: 'sb-prueba-auth-token' }))
vi.mock('../lib/auth', () => ({ salir }))
vi.mock('./remoto', () => ({ crearRemotoSupabase: () => servidorActual.valor }))

import { crearTarea, listarTareas } from '../repos/tareas'
import { listarHabitos } from '../repos/habitos'
import { ESTADO_INICIAL, estadoSync, reiniciarEstado } from './avisos'
import { ErrorSinSesion, NOMBRE_BD, abrirBase } from './bd'
import { cambiosSinSubir, cerrarSesion, detenerSync, iniciarSync, sincronizarAhora } from './sesion'
import { crearServidorFalso, type ServidorFalso } from './servidorFalso'

let servidor: ServidorFalso
let ventana: EventTarget
let red: { onLine: boolean }

async function hasta(condicion: () => boolean | Promise<boolean>, que: string) {
  for (let i = 0; i < 400; i++) {
    if (await condicion()) return
    await new Promise((ok) => setTimeout(ok, 5))
  }
  throw new Error(`No ha llegado a cumplirse: ${que}`)
}

const sincronizado = () => hasta(() => estadoSync().fase === 'sincronizado', 'fase sincronizado')

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  ventana = new EventTarget()
  red = { onLine: true }
  vi.stubGlobal('window', ventana)
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }))
  vi.stubGlobal('navigator', red)
  servidor = crearServidorFalso()
  servidor.semilla = [{ id: '11111111-1111-4111-8111-111111111111', nombre: 'Gimnasio', orden: 0, archivado: false }]
  servidorActual.valor = servidor
  salir.mockClear()
  reiniciarEstado()
})

afterEach(async () => {
  await detenerSync()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('iniciarSync', () => {
  it('deja la copia local lista al momento y hace la primera sincronización sola', async () => {
    iniciarSync('usuario-1')
    await expect(listarTareas()).resolves.toEqual([]) // se puede leer sin esperar a nada
    await sincronizado()
    expect((await listarHabitos()).map((h) => h.nombre)).toEqual(['Gimnasio'])
    expect(servidor.vecesInicializada).toBe(1)
  })

  it('repetir con el mismo usuario no arranca otro motor', async () => {
    iniciarSync('usuario-1')
    iniciarSync('usuario-1')
    await sincronizado()
    iniciarSync('usuario-1')
    await sincronizarAhora()
    expect(servidor.vecesInicializada).toBe(1)
  })

  it('un cambio local se sube solo al poco rato', async () => {
    iniciarSync('usuario-1')
    await sincronizado()
    await crearTarea({ texto: 'Sube sola' })
    await hasta(() => estadoSync().pendientes === 1, 'pendientes = 1')
    await hasta(() => servidor.filas('tareas').length === 1, 'la tarea llega al servidor')
    await hasta(() => estadoSync().pendientes === 0, 'pendientes = 0')
  }, 10_000)

  it('sin red no llama al servidor; al volver la conexión sincroniza', async () => {
    red.onLine = false
    iniciarSync('usuario-1')
    await hasta(() => estadoSync().fase === 'sin-conexion', 'fase sin-conexion')
    await crearTarea({ texto: 'Hecha sin red' })
    expect(servidor.peticiones).toEqual([])

    red.onLine = true
    ventana.dispatchEvent(new Event('online'))
    await sincronizado()
    expect(servidor.filas('tareas')).toHaveLength(1)
  })

  it('al cambiar de usuario sin cerrar sesión no se ve nada del anterior', async () => {
    iniciarSync('usuario-1')
    await sincronizado()
    await crearTarea({ texto: 'Privada del usuario 1' })

    servidorActual.valor = crearServidorFalso() // la cuenta del usuario 2 está vacía
    iniciarSync('usuario-2')
    expect(await listarTareas()).toEqual([])
    expect(await listarHabitos()).toEqual([])
    expect(await cambiosSinSubir()).toBe(0)
    await sincronizado()
    expect(await listarTareas()).toEqual([])
    expect(servidor.filas('tareas')).toEqual([]) // y lo pendiente del usuario 1 no se sube con la sesión del 2
  })
})

describe('cerrarSesion', () => {
  it('con conexión: sube lo pendiente antes de borrar y no se pierde nada', async () => {
    iniciarSync('usuario-1')
    await sincronizado()
    await crearTarea({ texto: 'Recién creada' })

    expect(await cerrarSesion()).toEqual({ cambiosPerdidos: 0 })
    expect(servidor.filas('tareas')).toHaveLength(1)
    expect(salir).toHaveBeenCalledTimes(1)
  })

  it('SIN conexión: cierra igualmente, borra la copia local y dice cuántos cambios se han perdido', async () => {
    iniciarSync('usuario-1')
    await sincronizado()
    red.onLine = false
    await crearTarea({ texto: 'No llegó a subir' })
    await crearTarea({ texto: 'Esta tampoco' })
    expect(await cambiosSinSubir()).toBe(2)

    expect(await cerrarSesion()).toEqual({ cambiosPerdidos: 2 })
    expect(salir).toHaveBeenCalledTimes(1)
    expect(estadoSync()).toEqual(ESTADO_INICIAL)
    await expect(listarTareas()).rejects.toBeInstanceOf(ErrorSinSesion)
    expect(await cambiosSinSubir()).toBe(0)

    // En el disco no queda nada: ni datos, ni cola, ni de quién era
    expect((await indexedDB.databases()).map((b) => b.name)).not.toContain(NOMBRE_BD)
    const nueva = await abrirBase('usuario-1')
    expect(await nueva.todos('tareas')).toEqual([])
    expect(await nueva.todos('habitos')).toEqual([])
    expect(await nueva.contar('cola')).toBe(0)
    nueva.cerrar()
  })

  it('si el servidor falla al subir lo pendiente, cierra igualmente y lo cuenta como perdido', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    iniciarSync('usuario-1')
    await sincronizado()
    servidor.fallo = (p) => (p.startsWith('guardar') ? { code: '57014', message: 'timeout' } : null)
    await crearTarea({ texto: 'El servidor no la acepta ahora' })

    expect(await cerrarSesion()).toEqual({ cambiosPerdidos: 1 })
    expect(salir).toHaveBeenCalledTimes(1)
    expect((await indexedDB.databases()).map((b) => b.name)).not.toContain(NOMBRE_BD)
  })

  it('borra la copia local ANTES de cerrar la sesión en el servidor (que puede tardar o fallar)', async () => {
    iniciarSync('usuario-1')
    await sincronizado()
    let basesAlSalir: (string | undefined)[] = ['sin comprobar']
    salir.mockImplementationOnce(async () => {
      basesAlSalir = (await indexedDB.databases()).map((b) => b.name)
    })
    await cerrarSesion()
    expect(basesAlSalir).toEqual([])
  })

  it('sin sesión iniciada no falla', async () => {
    expect(await cerrarSesion()).toEqual({ cambiosPerdidos: 0 })
    expect(salir).toHaveBeenCalledTimes(1)
  })
})

describe('detenerSync', () => {
  it('para el motor: lo que llegue después ya no se escribe ni cambia el estado', async () => {
    iniciarSync('usuario-1')
    await sincronizado()
    const peticionesAntes = servidor.peticiones.length
    await detenerSync()

    ventana.dispatchEvent(new Event('online'))
    ventana.dispatchEvent(new Event('focus'))
    await new Promise((ok) => setTimeout(ok, 30))
    expect(servidor.peticiones.length).toBe(peticionesAntes)
    expect(estadoSync()).toEqual(ESTADO_INICIAL)
    expect(await sincronizarAhora()).toBe(false)
  })

  it('se puede llamar sin sesión y varias veces (arranque sin sesión, SIGNED_OUT repetido)', async () => {
    await expect(detenerSync()).resolves.toBeUndefined()
    await expect(detenerSync()).resolves.toBeUndefined()
  })
})
