// Pruebas del motor de sincronización de punta a punta, sin navegador ni
// Supabase: IndexedDB de mentira (fake-indexeddb) y servidor de mentira
// (servidorFalso.ts, que imita los triggers del servidor de verdad).

import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hoy, restarDias } from '../lib/fechas'
import { idMarca } from '../lib/uuid'
import { borrarHabito, crearHabito, editarHabito, listarHabitos, listarMarcas, marcarDia, reordenarHabitos } from '../repos/habitos'
import { borrarTarea, crearTarea, editarTarea, listarTareas, marcarTarea, quitarHechas } from '../repos/tareas'
import { alCambioLocal, estadoSync, reiniciarEstado, versionDe } from './avisos'
import { ALMACEN_COLA, ErrorSinSesion, abrirBase, baseActual, usarBase, type BaseLocal } from './bd'
import { contarPendientes, listarPendientes } from './cola'
import { MENSAJE_ERROR_SYNC, crearMotor } from './motor'
import { crearServidorFalso } from './servidorFalso'

const HABITO_SEMILLA = '11111111-1111-4111-8111-111111111111'
const PASADO = '2001-01-01T00:00:00.000Z'
const FUTURO = '2099-01-01T00:00:00.000Z'

let abiertas: BaseLocal[] = []

async function montar(usuario = 'usuario-1') {
  const base = await abrirBase(usuario)
  abiertas.push(base)
  usarBase(Promise.resolve(base))
  const servidor = crearServidorFalso()
  servidor.semilla = [{ id: HABITO_SEMILLA, nombre: 'Gimnasio', orden: 0, archivado: false }]
  const red = { conectada: true }
  const motor = crearMotor({ base, remoto: servidor, enLinea: () => red.conectada })
  return { base, servidor, red, motor }
}

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  reiniciarEstado()
})

afterEach(() => {
  for (const base of abiertas) base.cerrar()
  abiertas = []
  usarBase(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('primera vez', () => {
  it('inicializa la cuenta una sola vez y descarga los hábitos iniciales', async () => {
    const { motor, servidor } = await montar()
    expect(estadoSync().primeraDescargaHecha).toBe(false)

    expect(await motor.sincronizar()).toBe(true)
    expect((await listarHabitos()).map((h) => h.nombre)).toEqual(['Gimnasio'])
    expect(estadoSync()).toMatchObject({ fase: 'sincronizado', sincronizando: false, pendientes: 0, error: null, primeraDescargaHecha: true })

    await motor.sincronizar()
    await motor.sincronizar()
    expect(servidor.vecesInicializada).toBe(1)
    expect(await listarHabitos()).toHaveLength(1)
  })

  it('si la inicialización falla en el servidor, no bloquea la sincronización y se reintenta', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { motor, servidor } = await montar()
    servidor.fallo = (p) => (p === 'inicializar_cuenta' ? { code: 'PGRST202', message: 'function not found' } : null)
    await crearTarea({ texto: 'Sube igual' })

    expect(await motor.sincronizar()).toBe(true)
    expect(servidor.filas('tareas')).toHaveLength(1)
    expect(aviso).toHaveBeenCalled()

    servidor.fallo = null
    await motor.sincronizar()
    expect(servidor.vecesInicializada).toBe(1)
    expect(await listarHabitos()).toHaveLength(1)
  })

  it('sin red en la inicialización: no hace nada más y se reintenta entera', async () => {
    const { motor, servidor } = await montar()
    servidor.fallo = () => new TypeError('Failed to fetch')
    expect(await motor.sincronizar()).toBe(false)
    expect(estadoSync().fase).toBe('sin-conexion')
    expect(servidor.peticiones).toEqual(['inicializar_cuenta'])
  })
})

describe('subir', () => {
  it('lo creado sin conexión se queda en la cola y sube al volver la red', async () => {
    const { motor, servidor, red, base } = await montar()
    red.conectada = false

    const tarea = await crearTarea({ texto: 'Estudiar SOR', fecha_limite: '2026-11-20' })
    expect(await motor.sincronizar()).toBe(false)
    expect(estadoSync()).toMatchObject({ fase: 'sin-conexion', pendientes: 1, error: null })
    expect(servidor.peticiones).toEqual([])
    expect(await listarTareas()).toHaveLength(1) // se ve aunque no haya red

    red.conectada = true
    expect(await motor.sincronizar()).toBe(true)
    expect(await contarPendientes(base)).toBe(0)
    expect(estadoSync()).toMatchObject({ fase: 'sincronizado', pendientes: 0 })

    const enServidor = servidor.fila('tareas', tarea.id)
    expect(enServidor).toMatchObject({ texto: 'Estudiar SOR', fecha_limite: '2026-11-20', hecha: false, updated_at: tarea.updated_at })
  })

  it('solo envía las columnas declaradas (nunca user_id ni sync_at)', async () => {
    const { motor, servidor, base } = await montar()
    await motor.sincronizar() // la fila semilla llega con user_id y sync_at del servidor
    const guardar = vi.spyOn(servidor, 'guardar')

    await editarHabito(HABITO_SEMILLA, { nombre: 'Gimnasio 1 h' })
    expect(await base.obtener('habitos', HABITO_SEMILLA)).toHaveProperty('user_id')
    await motor.sincronizar()

    expect(guardar).toHaveBeenCalledTimes(1)
    const [, filas] = guardar.mock.calls[0]
    expect(Object.keys(filas[0]).sort()).toEqual(['archivado', 'created_at', 'id', 'nombre', 'orden', 'updated_at'])
    expect(servidor.fila('habitos', HABITO_SEMILLA)?.nombre).toBe('Gimnasio 1 h')
  })

  it('sube el hábito antes que su marca, aunque la marca se apuntara antes en la cola', async () => {
    const { motor, servidor, red, base } = await montar()
    red.conectada = false
    const habito = await crearHabito('Leer 20 min')
    await marcarDia(habito.id, hoy(), true)
    await editarHabito(habito.id, { nombre: 'Leer 30 min' }) // vuelve a apuntar el hábito DESPUÉS de la marca
    await crearTarea({ texto: 'Otra cosa' })
    expect(await contarPendientes(base)).toBe(3)

    red.conectada = true
    expect(await motor.sincronizar()).toBe(true)
    const guardados = servidor.peticiones.filter((p) => p.startsWith('guardar'))
    expect(guardados).toEqual(['guardar habitos x1', 'guardar habito_marcas x1', 'guardar tareas x1'])
    expect(servidor.filas('habito_marcas')).toHaveLength(1)
  })

  it('varios cambios seguidos en la misma fila suben una sola vez, con el último valor', async () => {
    const { motor, servidor, red } = await montar()
    red.conectada = false
    const tarea = await crearTarea({ texto: 'Uno' })
    await editarTarea(tarea.id, { texto: 'Dos' })
    await marcarTarea(tarea.id, true)
    await motor.refrescarPendientes()
    expect(estadoSync().pendientes).toBe(1)

    red.conectada = true
    await motor.sincronizar()
    expect(servidor.peticiones.filter((p) => p.startsWith('guardar'))).toEqual(['guardar tareas x1'])
    expect(servidor.fila('tareas', tarea.id)).toMatchObject({ texto: 'Dos', hecha: true })
  })

  it('crear y borrar sin conexión no deja nada en el servidor', async () => {
    const { motor, servidor, red } = await montar()
    red.conectada = false
    const tarea = await crearTarea({ texto: 'Efímera' })
    await borrarTarea(tarea.id)
    red.conectada = true
    await motor.sincronizar()
    expect(servidor.filas('tareas')).toEqual([])
    expect(servidor.peticiones.filter((p) => p.startsWith('guardar'))).toEqual([])
    expect(estadoSync().pendientes).toBe(0)
  })

  it('borrar un hábito sube UN borrado; el servidor borra sus marcas en cascada', async () => {
    const { motor, servidor, base } = await montar()
    await motor.sincronizar()
    await marcarDia(HABITO_SEMILLA, hoy(), true)
    await marcarDia(HABITO_SEMILLA, restarDias(hoy(), 1), true)
    await motor.sincronizar()
    expect(servidor.filas('habito_marcas')).toHaveLength(2)

    await borrarHabito(HABITO_SEMILLA)
    expect(await listarMarcas()).toEqual([]) // la copia local ya no las tiene
    expect((await listarPendientes(base)).map((e) => `${e.op} ${e.tabla}`)).toEqual(['delete habitos'])

    servidor.peticiones.length = 0
    await motor.sincronizar()
    expect(servidor.peticiones.filter((p) => p.startsWith('borrar'))).toEqual(['borrar habitos x1'])
    expect(servidor.filas('habitos')).toEqual([])
    expect(servidor.filas('habito_marcas')).toEqual([])
    expect(await listarHabitos()).toEqual([])
  })

  it('una fila que cambia MIENTRAS se sube sigue pendiente y sube en la vuelta siguiente', async () => {
    const { motor, servidor } = await montar()
    const tarea = await crearTarea({ texto: 'Versión 1' })
    servidor.antesDeGuardar = async () => {
      servidor.antesDeGuardar = null
      await editarTarea(tarea.id, { texto: 'Versión 2' })
    }
    await motor.sincronizar()
    expect(estadoSync().pendientes).toBe(1)
    expect((await listarTareas())[0].texto).toBe('Versión 2') // la descarga no pisa el cambio local más nuevo

    await motor.sincronizar()
    expect(estadoSync().pendientes).toBe(0)
    expect(servidor.fila('tareas', tarea.id)?.texto).toBe('Versión 2')
  })
})

describe('bajar', () => {
  it('trae lo creado o cambiado en otro dispositivo y avisa a los lectores', async () => {
    const { motor, servidor } = await montar()
    await motor.sincronizar()
    const antes = versionDe(['tareas'])

    servidor.desdeOtroDispositivo('tareas', { id: 't-remota', texto: 'Desde el móvil', fecha_limite: null, hecha: false, hecha_en: null })
    await motor.sincronizar()

    expect((await listarTareas()).map((t) => t.texto)).toEqual(['Desde el móvil'])
    expect(versionDe(['tareas'])).toBeGreaterThan(antes)
  })

  it('una vuelta sin novedades no avisa a nadie ni marca cambios locales', async () => {
    const { motor } = await montar()
    await motor.sincronizar()
    await motor.sincronizar()
    const antes = versionDe(['habitos', 'habito_marcas', 'tareas'])
    const locales = vi.fn()
    const soltar = alCambioLocal(locales)
    await motor.sincronizar()
    soltar()
    expect(versionDe(['habitos', 'habito_marcas', 'tareas'])).toBe(antes)
    expect(locales).not.toHaveBeenCalled()
  })

  it('descarga incremental: la segunda vez pide solo lo posterior a la última descarga (con margen)', async () => {
    const { motor, servidor } = await montar()
    await motor.sincronizar()
    const descargar = vi.spyOn(servidor, 'descargar')
    await motor.sincronizar()
    const desde = descargar.mock.calls[0][1]
    expect(desde).not.toBeNull()
    const ultima = Math.max(...servidor.filas('habitos').map((f) => Date.parse(f.sync_at)))
    expect(Date.parse(String(desde))).toBe(ultima - 60_000)
    // y ahora sí consulta los borrados (la primera vez no hace falta)
    expect(servidor.peticiones.filter((p) => p === 'descargar borrados')).toHaveLength(1)
  })

  it('aplica los borrados de otro dispositivo, con sus hijas y sus cambios pendientes', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { motor, servidor, base } = await montar()
    await motor.sincronizar()
    await marcarDia(HABITO_SEMILLA, restarDias(hoy(), 1), true)
    const tarea = await crearTarea({ texto: 'Se borrará en el móvil' })
    await motor.sincronizar()

    servidor.borrarDesdeOtroDispositivo('habitos', HABITO_SEMILLA)
    servidor.borrarDesdeOtroDispositivo('tareas', tarea.id)
    // Mientras, aquí (sin saberlo) se marca hoy ese hábito y se edita esa tarea
    await marcarDia(HABITO_SEMILLA, hoy(), true)
    await editarTarea(tarea.id, { texto: 'Editada tarde' })

    await motor.sincronizar()
    expect(await listarHabitos()).toEqual([])
    expect(await listarMarcas()).toEqual([])
    expect(await listarTareas()).toEqual([])
    expect(await contarPendientes(base)).toBe(0)
    expect(servidor.filas('habito_marcas')).toEqual([])
  })
})

describe('conflictos: gana el updated_at más reciente', () => {
  it('cambio local más reciente que el del servidor: gana el local', async () => {
    const { motor, servidor } = await montar()
    const tarea = await crearTarea({ texto: 'Original' })
    await motor.sincronizar()

    servidor.desdeOtroDispositivo('tareas', { id: tarea.id, texto: 'Del móvil (antiguo)', updated_at: PASADO })
    // El servidor ignora la versión antigua (trigger antes_de_guardar)
    expect(servidor.fila('tareas', tarea.id)?.texto).toBe('Original')

    await editarTarea(tarea.id, { texto: 'Del PC (nuevo)' })
    await motor.sincronizar()
    expect(servidor.fila('tareas', tarea.id)?.texto).toBe('Del PC (nuevo)')
    expect((await listarTareas())[0].texto).toBe('Del PC (nuevo)')
  })

  it('cambio del servidor más reciente que el local pendiente: gana el servidor y se vacía la cola', async () => {
    const { motor, servidor, red, base } = await montar()
    const tarea = await crearTarea({ texto: 'Original' })
    await motor.sincronizar()

    red.conectada = false
    await editarTarea(tarea.id, { texto: 'Del PC' })
    servidor.desdeOtroDispositivo('tareas', { id: tarea.id, texto: 'Del móvil (más nuevo)', updated_at: FUTURO })
    red.conectada = true

    await motor.sincronizar()
    expect(servidor.fila('tareas', tarea.id)?.texto).toBe('Del móvil (más nuevo)')
    expect((await listarTareas())[0].texto).toBe('Del móvil (más nuevo)')
    expect(await contarPendientes(base)).toBe(0)
  })

  it('tras recibir una fila "del futuro", un cambio local posterior sigue ganando (updated_at nunca retrocede)', async () => {
    const { motor, servidor } = await montar()
    servidor.desdeOtroDispositivo('tareas', { id: 't1', texto: 'Reloj adelantado', fecha_limite: null, hecha: false, hecha_en: null, updated_at: FUTURO })
    await motor.sincronizar()

    const editada = await editarTarea('t1', { texto: 'Corregida aquí' })
    expect(Date.parse(editada.updated_at)).toBeGreaterThan(Date.parse(FUTURO))
    await motor.sincronizar()
    expect(servidor.fila('tareas', 't1')?.texto).toBe('Corregida aquí')
  })

  it('borrado local pendiente frente a un cambio remoto: se sube el borrado', async () => {
    const { motor, servidor, red } = await montar()
    const tarea = await crearTarea({ texto: 'Original' })
    await motor.sincronizar()

    red.conectada = false
    await borrarTarea(tarea.id)
    servidor.desdeOtroDispositivo('tareas', { id: tarea.id, texto: 'Editada en el móvil', updated_at: FUTURO })
    red.conectada = true

    await motor.sincronizar()
    expect(servidor.filas('tareas')).toEqual([])
    expect(await listarTareas()).toEqual([])
  })

  // Los tres casos siguientes son los que decide reglas.decidirDescarga: el
  // cambio local se hace cuando la vuelta ya ha subido la cola, así que al
  // descargar la fila tiene un cambio pendiente.
  function editarJustoAntesDeDescargar(servidor: ReturnType<typeof crearServidorFalso>, accion: () => Promise<unknown>) {
    servidor.antesDeDescargar = async (tabla) => {
      if (tabla !== 'tareas') return
      servidor.antesDeDescargar = null
      await accion()
    }
  }

  it('llega una versión MÁS NUEVA de una fila con cambio local pendiente: gana el servidor y el pendiente se descarta', async () => {
    const { motor, servidor, base } = await montar()
    const tarea = await crearTarea({ texto: 'Original' })
    await motor.sincronizar()

    servidor.desdeOtroDispositivo('tareas', { id: tarea.id, texto: 'Del móvil (más nuevo)', updated_at: FUTURO })
    editarJustoAntesDeDescargar(servidor, () => editarTarea(tarea.id, { texto: 'Del PC' }))
    await motor.sincronizar()

    expect((await listarTareas())[0].texto).toBe('Del móvil (más nuevo)')
    expect(await contarPendientes(base)).toBe(0)
  })

  it('llega una versión MÁS ANTIGUA de una fila con cambio local pendiente: se ignora y el local sube después', async () => {
    const { motor, servidor, base } = await montar()
    const tarea = await crearTarea({ texto: 'Original' })
    await motor.sincronizar()

    servidor.desdeOtroDispositivo('tareas', { id: tarea.id, texto: 'Del móvil', updated_at: new Date(Date.parse(tarea.updated_at) + 1).toISOString() })
    editarJustoAntesDeDescargar(servidor, () => editarTarea(tarea.id, { texto: 'Del PC (más nuevo)' }))
    await motor.sincronizar()

    expect((await listarTareas())[0].texto).toBe('Del PC (más nuevo)')
    expect(await contarPendientes(base)).toBe(1)
    await motor.sincronizar()
    expect(servidor.fila('tareas', tarea.id)?.texto).toBe('Del PC (más nuevo)')
  })

  it('llega una fila que aquí se acaba de borrar: no resucita y el borrado sube después', async () => {
    const { motor, servidor } = await montar()
    const tarea = await crearTarea({ texto: 'Original' })
    await motor.sincronizar()

    servidor.desdeOtroDispositivo('tareas', { id: tarea.id, texto: 'Editada en el móvil', updated_at: FUTURO })
    editarJustoAntesDeDescargar(servidor, () => borrarTarea(tarea.id))
    await motor.sincronizar()
    expect(await listarTareas()).toEqual([])

    await motor.sincronizar()
    expect(servidor.filas('tareas')).toEqual([])
    expect(await listarTareas()).toEqual([])
  })

  it('dos dispositivos marcan el mismo hábito el mismo día: es la misma fila y gana el último', async () => {
    const { motor, servidor } = await montar()
    await motor.sincronizar()
    const dia = hoy()
    // El móvil lo marcó hace mucho (id determinista: el mismo que calculará el PC)
    servidor.desdeOtroDispositivo('habito_marcas', { id: idMarca(HABITO_SEMILLA, dia), habito_id: HABITO_SEMILLA, fecha: dia, hecho: true, updated_at: PASADO })
    await motor.sincronizar()
    expect((await listarMarcas())[0].hecho).toBe(true)

    await marcarDia(HABITO_SEMILLA, dia, false) // el PC lo desmarca después
    await motor.sincronizar()
    expect(servidor.filas('habito_marcas')).toHaveLength(1)
    expect(servidor.filas('habito_marcas')[0].hecho).toBe(false)
  })
})

describe('errores', () => {
  it('error de red a mitad: fase sin-conexion, la cola no se pierde y luego se recupera', async () => {
    const { motor, servidor, base } = await montar()
    await motor.sincronizar()
    await crearTarea({ texto: 'Pendiente' })

    servidor.fallo = (p) => (p.startsWith('guardar') ? new TypeError('Failed to fetch') : null)
    expect(await motor.sincronizar()).toBe(false)
    expect(estadoSync()).toMatchObject({ fase: 'sin-conexion', pendientes: 1, error: null })
    expect(await contarPendientes(base)).toBe(1)

    servidor.fallo = null
    expect(await motor.sincronizar()).toBe(true)
    expect(servidor.filas('tareas')).toHaveLength(1)
  })

  it('error del servidor (500, sesión caducada…): fase error con mensaje genérico; no se pierde nada', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { motor, servidor, base } = await montar()
    await motor.sincronizar()
    await crearTarea({ texto: 'Pendiente' })

    for (const error of [
      { code: 'PGRST301', message: 'JWT expired' },
      { code: '42501', message: 'permission denied for table tareas' }, // petición sin sesión: NO es culpa de la fila
      { message: 'relation "secreta" does not exist', code: '42P01' },
    ]) {
      servidor.fallo = (p) => (p.startsWith('guardar') ? error : null)
      expect(await motor.sincronizar()).toBe(false)
      expect(estadoSync()).toMatchObject({ fase: 'error', error: MENSAJE_ERROR_SYNC, pendientes: 1, rechazados: 0 })
      expect(estadoSync().error).not.toContain('secreta')
      expect(await contarPendientes(base)).toBe(1)
      expect(await listarTareas()).toHaveLength(1)
    }
    expect(aviso).toHaveBeenCalled()

    servidor.fallo = null
    expect(await motor.sincronizar()).toBe(true)
    expect(estadoSync()).toMatchObject({ fase: 'sincronizado', error: null, pendientes: 0 })
  })

  it('fila rechazada por el servidor: se deshace en local, se cuenta y las demás del lote suben', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { motor, servidor, base } = await montar()
    await motor.sincronizar()
    const buena = await crearTarea({ texto: 'Buena' })
    const mala = await crearTarea({ texto: 'Mala' })
    await editarHabito(HABITO_SEMILLA, { nombre: 'Nombre que el servidor no acepta' })
    servidor.rechazar = (_tabla, fila) => (fila.id === mala.id || fila.id === HABITO_SEMILLA ? '23514' : null)

    expect(await motor.sincronizar()).toBe(true)
    expect(servidor.filas('tareas').map((t) => t.id)).toEqual([buena.id])
    // La tarea que no existe en el servidor desaparece; el hábito vuelve a como está allí
    expect((await listarTareas()).map((t) => t.id)).toEqual([buena.id])
    expect((await listarHabitos())[0].nombre).toBe('Gimnasio')
    expect(await contarPendientes(base)).toBe(0)
    expect(estadoSync()).toMatchObject({ fase: 'sincronizado', rechazados: 2, pendientes: 0 })
  })
})

describe('vueltas simultáneas y parada', () => {
  it('pedir otra sincronización durante una en marcha hace una vuelta más (no dos a la vez)', async () => {
    const { motor, servidor } = await montar()
    const primera = motor.sincronizar()
    await crearTarea({ texto: 'Creada durante la primera vuelta' })
    const segunda = motor.sincronizar()
    const tercera = motor.sincronizar()
    expect(tercera).toBe(segunda)
    expect(await primera).toBe(true)
    expect(await segunda).toBe(true)
    expect(servidor.filas('tareas')).toHaveLength(1)
    expect(servidor.vecesInicializada).toBe(1)
  })

  it('un motor detenido no sincroniza ni toca el estado', async () => {
    const { motor, servidor } = await montar()
    await crearTarea({ texto: 'No debe subir' })
    motor.detener()
    expect(await motor.sincronizar()).toBe(false)
    await motor.refrescarPendientes()
    expect(servidor.peticiones).toEqual([])
    expect(estadoSync().fase).toBe('inactivo')
  })

  it('si se detiene a mitad de la descarga, lo que llega después no se escribe', async () => {
    const { motor, servidor, base } = await montar()
    servidor.fallo = (p) => {
      if (p === 'descargar habitos') motor.detener() // cierre de sesión justo ahora
      return null
    }
    expect(await motor.sincronizar()).toBe(false)
    expect(await base.todos('habitos')).toEqual([])
    expect(estadoSync().fase).toBe('sincronizando') // el estado ya no es cosa de este motor: lo reinicia quien lo paró
  })
})

describe('copia local por usuario', () => {
  it('al abrirla otro usuario se vacía entera: datos, cola y meta', async () => {
    const { motor, base } = await montar('usuario-1')
    await motor.sincronizar()
    await crearTarea({ texto: 'Privada del usuario 1' })
    expect(await base.contar(ALMACEN_COLA)).toBe(1)
    base.cerrar()

    const otra = await abrirBase('usuario-2')
    abiertas.push(otra)
    expect(await otra.todos('tareas')).toEqual([])
    expect(await otra.todos('habitos')).toEqual([])
    expect(await otra.contar(ALMACEN_COLA)).toBe(0)
    expect(await otra.leerMeta('ultima_descarga')).toBeUndefined()
    expect(await otra.leerMeta('cuenta_inicializada')).toBeUndefined()
    expect(await otra.leerMeta('usuario')).toBe('usuario-2')
  })

  it('el mismo usuario conserva sus datos y su cola al volver a abrir (recargar la app sin conexión)', async () => {
    const { motor, base } = await montar('usuario-1')
    await motor.sincronizar()
    await crearTarea({ texto: 'Sin subir' })
    base.cerrar()

    const otraVez = await abrirBase('usuario-1')
    abiertas.push(otraVez)
    expect(await otraVez.todos('tareas')).toHaveLength(1)
    expect(await otraVez.contar(ALMACEN_COLA)).toBe(1)
    expect(await otraVez.leerMeta('primera_descarga')).toBe(true)
  })

  it('una base cerrada rechaza cualquier operación', async () => {
    const { base } = await montar()
    base.cerrar()
    expect(base.cerrada).toBe(true)
    await expect(base.todos('tareas')).rejects.toThrow()
    await expect(base.guardarMeta('x', 1)).rejects.toThrow()
  })

  it('sin sesión, los repositorios fallan con ErrorSinSesion en vez de leer nada', async () => {
    await montar()
    usarBase(null)
    await expect(baseActual()).rejects.toBeInstanceOf(ErrorSinSesion)
    await expect(listarTareas()).rejects.toBeInstanceOf(ErrorSinSesion)
    await expect(crearTarea({ texto: 'x' })).rejects.toBeInstanceOf(ErrorSinSesion)
  })

  it('declarar una tabla nueva amplía la base sin perder lo que había', async () => {
    const { base } = await montar('usuario-1')
    await crearTarea({ texto: 'Sigue aquí' })
    base.cerrar()

    const ampliada = await abrirBase('usuario-1', [
      { nombre: 'tareas', columnas: ['texto'] },
      { nombre: 'movimientos', columnas: ['concepto'], indices: ['fecha'] },
    ])
    abiertas.push(ampliada)
    expect(await ampliada.todos('tareas')).toHaveLength(1)
    expect(await ampliada.todos('movimientos')).toEqual([])
    expect(await ampliada.porIndice('movimientos', 'fecha', '2026-11-13')).toEqual([])
  })
})

describe('flujos de la fase 3 de punta a punta (repositorios + motor + servidor falso)', () => {
  it('rechazo RLS (42501 "row-level security") de una fila: no se reintenta para siempre y cuenta en rechazados', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { motor, servidor, base } = await montar()
    await motor.sincronizar()
    const mala = await crearTarea({ texto: 'La rechaza RLS' })
    const buena = await crearTarea({ texto: 'Buena' })
    servidor.rechazar = (_t, fila) => (fila.id === mala.id ? '42501' : null)

    expect(await motor.sincronizar()).toBe(true)
    expect(estadoSync()).toMatchObject({ fase: 'sincronizado', rechazados: 1, pendientes: 0, error: null })
    expect(await contarPendientes(base)).toBe(0)
    expect(servidor.filas('tareas').map((t) => t.id)).toEqual([buena.id])
    expect((await listarTareas()).map((t) => t.id)).toEqual([buena.id])

    // Las vueltas siguientes ya no la vuelven a mandar
    servidor.peticiones.length = 0
    await motor.sincronizar()
    await motor.sincronizar()
    expect(servidor.peticiones.filter((p) => p.startsWith('guardar'))).toEqual([])
    expect(estadoSync().rechazados).toBe(1)
  })

  it('hábito: crear, renombrar, reordenar, archivar, recuperar y borrar llegan al servidor', async () => {
    const { motor, servidor } = await montar()
    await motor.sincronizar()
    const leer = await crearHabito('Leer')
    const agua = await crearHabito('Beber agua')
    await motor.sincronizar()
    expect(servidor.filas('habitos').map((h) => h.nombre).sort()).toEqual(['Beber agua', 'Gimnasio', 'Leer'])

    await editarHabito(leer.id, { nombre: 'Leer 30 min' })
    await reordenarHabitos([agua.id, HABITO_SEMILLA, leer.id])
    await motor.sincronizar()
    expect(servidor.fila('habitos', leer.id)).toMatchObject({ nombre: 'Leer 30 min', orden: 2 })
    expect(servidor.fila('habitos', agua.id)?.orden).toBe(0)
    expect(servidor.fila('habitos', HABITO_SEMILLA)?.orden).toBe(1)

    await marcarDia(leer.id, hoy(), true)
    await editarHabito(leer.id, { archivado: true })
    await motor.sincronizar()
    expect(servidor.fila('habitos', leer.id)?.archivado).toBe(true)
    expect(servidor.filas('habito_marcas')).toHaveLength(1) // archivar conserva el historial

    await editarHabito(leer.id, { archivado: false })
    await motor.sincronizar()
    expect(servidor.fila('habitos', leer.id)?.archivado).toBe(false)

    await borrarHabito(leer.id)
    await motor.sincronizar()
    expect(servidor.fila('habitos', leer.id)).toBeUndefined()
    expect(servidor.filas('habito_marcas')).toEqual([])
    expect((await listarHabitos()).map((h) => h.nombre)).toEqual(['Beber agua', 'Gimnasio'])
  })

  it('marcar y desmarcar un día: la fila del servidor sigue el último cambio y nunca se duplica', async () => {
    const { motor, servidor } = await montar()
    await motor.sincronizar()
    await marcarDia(HABITO_SEMILLA, hoy(), true)
    await motor.sincronizar()
    expect(servidor.filas('habito_marcas')).toMatchObject([{ id: idMarca(HABITO_SEMILLA, hoy()), hecho: true }])
    await marcarDia(HABITO_SEMILLA, hoy(), false)
    await motor.sincronizar()
    expect(servidor.filas('habito_marcas')).toMatchObject([{ id: idMarca(HABITO_SEMILLA, hoy()), hecho: false }])
  })

  it('dos dispositivos SIN conexión marcan el mismo hábito el mismo día: al subir los dos queda una sola fila', async () => {
    const servidor = crearServidorFalso()
    servidor.semilla = [{ id: HABITO_SEMILLA, nombre: 'Gimnasio', orden: 0, archivado: false }]
    const dispositivo = async () => {
      vi.stubGlobal('indexedDB', new IDBFactory()) // cada dispositivo tiene su propio IndexedDB
      const base = await abrirBase('usuario-1')
      abiertas.push(base)
      const red = { conectada: true }
      return { base, red, motor: crearMotor({ base, remoto: servidor, enLinea: () => red.conectada }) }
    }
    const movil = await dispositivo()
    const pc = await dispositivo()
    usarBase(Promise.resolve(movil.base))
    await movil.motor.sincronizar()
    usarBase(Promise.resolve(pc.base))
    await pc.motor.sincronizar()

    movil.red.conectada = false
    pc.red.conectada = false
    usarBase(Promise.resolve(movil.base))
    await marcarDia(HABITO_SEMILLA, hoy(), true)
    usarBase(Promise.resolve(pc.base))
    await marcarDia(HABITO_SEMILLA, hoy(), true)

    movil.red.conectada = true
    pc.red.conectada = true
    expect(await movil.motor.sincronizar()).toBe(true)
    expect(await pc.motor.sincronizar()).toBe(true)
    usarBase(Promise.resolve(movil.base))
    expect(await movil.motor.sincronizar()).toBe(true)

    expect(servidor.filas('habito_marcas')).toHaveLength(1)
    expect(servidor.filas('habito_marcas')[0]).toMatchObject({ habito_id: HABITO_SEMILLA, fecha: hoy(), hecho: true })
    expect(await listarMarcas()).toHaveLength(1)
    usarBase(Promise.resolve(pc.base))
    expect(await listarMarcas()).toHaveLength(1)
  })

  it('tareas: crear con y sin fecha, editar, marcar hecha y quitar las hechas llegan al servidor', async () => {
    const { motor, servidor } = await montar()
    await motor.sincronizar()
    const conFecha = await crearTarea({ texto: 'Entregar SOR', fecha_limite: '2026-11-20' })
    const sinFecha = await crearTarea({ texto: 'Comprar pan' })
    await motor.sincronizar()
    expect(servidor.fila('tareas', conFecha.id)).toMatchObject({ fecha_limite: '2026-11-20', hecha: false })
    expect(servidor.fila('tareas', sinFecha.id)).toMatchObject({ fecha_limite: null, hecha: false })

    await editarTarea(sinFecha.id, { texto: 'Comprar pan y leche', fecha_limite: '2026-11-14' })
    await marcarTarea(conFecha.id, true)
    await motor.sincronizar()
    expect(servidor.fila('tareas', sinFecha.id)).toMatchObject({ texto: 'Comprar pan y leche', fecha_limite: '2026-11-14' })
    expect(servidor.fila('tareas', conFecha.id)?.hecha).toBe(true)
    expect(servidor.fila('tareas', conFecha.id)?.hecha_en).toEqual(expect.any(String))

    servidor.peticiones.length = 0
    expect(await quitarHechas()).toBe(1)
    await motor.sincronizar()
    expect(servidor.peticiones.filter((p) => p.startsWith('borrar'))).toEqual(['borrar tareas x1'])
    expect(servidor.filas('tareas').map((t) => t.id)).toEqual([sinFecha.id])
  })

  it('sin conexión: hábito, marca y tareas creados offline suben todos al volver la red', async () => {
    const { motor, servidor, red, base } = await montar()
    await motor.sincronizar()
    red.conectada = false
    const h = await crearHabito('Meditar')
    await marcarDia(h.id, hoy(), true)
    await marcarDia(h.id, restarDias(hoy(), 1), true)
    await crearTarea({ texto: 'Sin fecha' })
    await crearTarea({ texto: 'Con fecha', fecha_limite: '2027-01-01' })
    expect(await motor.sincronizar()).toBe(false)
    expect(estadoSync()).toMatchObject({ fase: 'sin-conexion', pendientes: 5 })

    red.conectada = true
    expect(await motor.sincronizar()).toBe(true)
    expect(await contarPendientes(base)).toBe(0)
    expect(servidor.fila('habitos', h.id)?.nombre).toBe('Meditar')
    expect(servidor.filas('habito_marcas')).toHaveLength(2)
    expect(servidor.filas('tareas')).toHaveLength(2)
  })
})
