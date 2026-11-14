// Fase 8 de punta a punta: ideas, cumpleaños, planes y deseos con el motor,
// IndexedDB de mentira (un IndexedDB por dispositivo) y el servidor falso.

import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { crearCumple, editarCumple, listarCumpleanos, borrarCumple } from '../repos/cumpleanos'
import { crearDeseo, listarDeseos, marcarComprado, borrarDeseo } from '../repos/deseos'
import { archivarIdea, borrarIdea, crearIdea, listarIdeas } from '../repos/ideas'
import { listarMovimientos } from '../repos/movimientos'
import { crearPlan, listarPlanes, marcarHecho, borrarPlan } from '../repos/planes'
import { borrarTarea, crearTarea, listarTareas, marcarTarea } from '../repos/tareas'
import { estadoSync, reiniciarEstado } from './avisos'
import { abrirBase, usarBase, type BaseLocal } from './bd'
import { contarPendientes } from './cola'
import { crearMotor, type Motor } from './motor'
import { crearServidorFalso, type ServidorFalso } from './servidorFalso'
import { TABLAS } from './tablas'

let abiertas: BaseLocal[] = []

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
  const d = { base, red, motor: crearMotor({ base, remoto: servidor, enLinea: () => red.conectada }), usar: () => usarBase(Promise.resolve(base)) }
  d.usar()
  return d
}

async function sincronizar(d: Dispositivo) {
  d.usar()
  return d.motor.sincronizar()
}

const hora = (iso: string) => vi.setSystemTime(new Date(iso))
const HOY = '2026-11-14'

beforeEach(() => {
  reiniciarEstado()
  vi.useFakeTimers({ toFake: ['Date'] })
  hora('2026-11-14T10:00:00.000Z')
})

afterEach(() => {
  for (const base of abiertas) base.cerrar()
  abiertas = []
  usarBase(null)
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('las 4 tablas nuevas están en la sincronización', () => {
  it('definidas con sus columnas (y ninguna es de solo lectura)', () => {
    for (const nombre of ['ideas', 'cumpleanos', 'planes', 'deseos']) {
      const def = TABLAS.find((t) => t.nombre === nombre)
      expect(def, nombre).toBeDefined()
      expect((def as { soloLectura?: boolean }).soloLectura ?? false).toBe(false)
    }
  })
})

describe('dos dispositivos', () => {
  it('lo creado sin conexión en el PC sube al volver la red y baja al móvil, con todos sus campos', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    const movil = await dispositivo(servidor)
    await sincronizar(pc)
    await sincronizar(movil)

    pc.usar()
    pc.red.conectada = false
    const i = await crearIdea('Aprender a hacer pan\ncon masa madre')
    const c = await crearCumple({ nombre: 'Lucía', dia: '29', mes: '2', anio: '2004', notas: 'libros' }, HOY)
    const p = await crearPlan({ titulo: 'Bolos', tipo: 'actividad', con_quien: 'Ana', fecha: '2026-12-01', coste: '12,50', notas: '' })
    const d = await crearDeseo({ articulo: 'Bici', precio: '300', prioridad: 'alta', enlace: 'tienda.es/bici', notas: '' })
    expect(await sincronizar(pc)).toBe(false)
    expect(estadoSync()).toMatchObject({ fase: 'sin-conexion', pendientes: 4 })

    pc.red.conectada = true
    expect(await sincronizar(pc)).toBe(true)
    expect(await contarPendientes(pc.base)).toBe(0)
    expect(servidor.fila('ideas', i.id)).toMatchObject({ texto: 'Aprender a hacer pan\ncon masa madre', archivada: false })
    expect(servidor.fila('cumpleanos', c.id)).toMatchObject({ nombre: 'Lucía', dia: 29, mes: 2, anio: 2004, notas: 'libros' })
    expect(servidor.fila('planes', p.id)).toMatchObject({ estado: 'planeado', fecha: '2026-12-01', coste_centimos: 1250, con_quien: 'Ana', valoracion: null })
    expect(servidor.fila('deseos', d.id)).toMatchObject({ precio_centimos: 30000, enlace: 'https://tienda.es/bici', comprado: false, comprado_en: null })

    await sincronizar(movil)
    expect((await listarIdeas()).map((x) => x.id)).toEqual([i.id])
    expect(await listarCumpleanos()).toMatchObject([{ id: c.id, dia: 29, mes: 2, anio: 2004 }])
    expect(await listarPlanes()).toMatchObject([{ id: p.id, coste_centimos: 1250 }])
    expect(await listarDeseos()).toMatchObject([{ id: d.id, precio_centimos: 30000 }])
  })

  it('los borrados de las 4 tablas llegan al otro dispositivo', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    const movil = await dispositivo(servidor)
    pc.usar()
    const i = await crearIdea('x')
    const c = await crearCumple({ nombre: 'Ana', dia: '1', mes: '1', anio: '', notas: '' }, HOY)
    const p = await crearPlan({ titulo: 'p', tipo: 'otro', con_quien: '', fecha: '', coste: '', notas: '' })
    const d = await crearDeseo({ articulo: 'd', precio: '1', prioridad: 'baja', enlace: '', notas: '' })
    await sincronizar(pc)
    await sincronizar(movil)
    expect(await listarIdeas()).toHaveLength(1)

    movil.usar()
    hora('2026-11-14T10:01:00.000Z')
    await borrarIdea(i.id)
    await borrarCumple(c.id)
    await borrarPlan(p.id)
    await borrarDeseo(d.id)
    expect(await sincronizar(movil)).toBe(true)
    for (const t of ['ideas', 'cumpleanos', 'planes', 'deseos']) expect(servidor.filas(t), t).toEqual([])

    await sincronizar(pc)
    expect(await listarIdeas()).toEqual([])
    expect(await listarCumpleanos()).toEqual([])
    expect(await listarPlanes()).toEqual([])
    expect(await listarDeseos()).toEqual([])
  })

  it('editar el mismo cumpleaños en los dos: gana el último cambio en ambos', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    const movil = await dispositivo(servidor)
    pc.usar()
    const c = await crearCumple({ nombre: 'Ana', dia: '1', mes: '1', anio: '', notas: '' }, HOY)
    await sincronizar(pc)
    await sincronizar(movil)
    pc.red.conectada = false
    movil.red.conectada = false

    movil.usar()
    hora('2026-11-14T11:00:05.000Z')
    await editarCumple(c.id, { nombre: 'Ana', dia: '2', mes: '1', anio: '', notas: 'la última' }, HOY)
    pc.usar()
    hora('2026-11-14T11:00:00.000Z')
    await editarCumple(c.id, { nombre: 'Ana', dia: '3', mes: '1', anio: '', notas: 'antigua' }, HOY)

    pc.red.conectada = true
    movil.red.conectada = true
    await sincronizar(movil)
    await sincronizar(pc)
    await sincronizar(movil)
    expect(servidor.fila('cumpleanos', c.id)).toMatchObject({ dia: 2, notas: 'la última' })
    for (const d of [pc, movil]) {
      d.usar()
      expect(await listarCumpleanos()).toMatchObject([{ dia: 2, notas: 'la última' }])
    }
  })

  it('convertir una idea en tarea en el PC mientras el móvil la borra: la tarea queda y la idea desaparece en los dos', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    const movil = await dispositivo(servidor)
    pc.usar()
    const i = await crearIdea('Llamar al dentista')
    await sincronizar(pc)
    await sincronizar(movil)
    pc.red.conectada = false

    movil.usar()
    await borrarIdea(i.id)
    await sincronizar(movil)

    pc.usar()
    hora('2026-11-14T10:02:00.000Z')
    await crearTarea({ texto: 'Llamar al dentista' }, i.id)
    pc.red.conectada = true
    expect(await sincronizar(pc)).toBe(true)
    await sincronizar(movil)
    for (const d of [pc, movil]) {
      d.usar()
      expect(await listarIdeas()).toEqual([])
      expect((await listarTareas()).map((t) => t.texto)).toEqual(['Llamar al dentista'])
    }
    expect(estadoSync().rechazados).toBe(0)
  })

  // FALLO CONOCIDO (del motor, no solo de ideas: pasa igual con tareas). Si un
  // dispositivo edita sin conexión una fila que otro ya borró, el servidor la
  // vuelve a crear (solo movimientos tiene no_revivir_borrado), pero los dos
  // dispositivos le aplican después el borrado (motor.ts, bajar(): filas y
  // DESPUÉS borrados dentro del margen). Queda una fila «zombi» en el servidor
  // que nadie ve y que reaparece al entrar en un dispositivo nuevo.
  it.each(['ideas', 'tareas'] as const)('%s: borrada en un dispositivo y editada después en el otro sin conexión: los dos acaban igual que el servidor', async (tabla) => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    const movil = await dispositivo(servidor)
    pc.usar()
    const id = tabla === 'ideas' ? (await crearIdea('Viaje')).id : (await crearTarea({ texto: 'Viaje' })).id
    await sincronizar(pc)
    await sincronizar(movil)
    movil.red.conectada = false

    pc.usar()
    if (tabla === 'ideas') await crearPlan({ titulo: 'Viaje', tipo: 'viaje', con_quien: '', fecha: '', coste: '', notas: '' }, id)
    else await borrarTarea(id)
    await sincronizar(pc)
    expect(servidor.fila(tabla, id)).toBeUndefined()

    movil.usar()
    hora('2026-11-14T10:05:00.000Z')
    if (tabla === 'ideas') await archivarIdea(id, true)
    else await marcarTarea(id, true)
    movil.red.conectada = true
    await sincronizar(movil)
    await sincronizar(pc)
    await sincronizar(movil)

    const enServidor = servidor.fila(tabla, id) !== undefined
    pc.usar()
    const enPc = (tabla === 'ideas' ? await listarIdeas() : await listarTareas()).some((x) => x.id === id)
    movil.usar()
    const enMovil = (tabla === 'ideas' ? await listarIdeas() : await listarTareas()).some((x) => x.id === id)
    expect({ enPc, enMovil }).toEqual({ enPc: enServidor, enMovil: enServidor })
  })

  it('comprado con gasto sin conexión: el deseo y el gasto suben juntos y el otro dispositivo ve los dos', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    const movil = await dispositivo(servidor)
    pc.usar()
    const d = await crearDeseo({ articulo: 'Auriculares', precio: '59,99', prioridad: 'alta', enlace: '', notas: '' })
    await sincronizar(pc)
    pc.red.conectada = false
    await marcarComprado(d.id, true, HOY)
    expect(await contarPendientes(pc.base)).toBe(2)
    pc.red.conectada = true
    await sincronizar(pc)
    expect(servidor.fila('deseos', d.id)).toMatchObject({ comprado: true, comprado_en: HOY })
    expect(servidor.filas('movimientos')).toMatchObject([{ tipo: 'gasto', importe_centimos: 5999, categoria: 'compras', fecha: HOY }])

    await sincronizar(movil)
    expect(await listarDeseos()).toMatchObject([{ comprado: true }])
    expect(await listarMovimientos()).toHaveLength(1)
  })

  it('el plan marcado hecho en el móvil llega con su valoración', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    const movil = await dispositivo(servidor)
    pc.usar()
    const p = await crearPlan({ titulo: 'Cena', tipo: 'comida', con_quien: '', fecha: '', coste: '', notas: '' })
    await sincronizar(pc)
    await sincronizar(movil)
    movil.usar()
    hora('2026-11-14T12:00:00.000Z')
    await marcarHecho(p.id, 5, 'top', HOY)
    await sincronizar(movil)
    await sincronizar(pc)
    expect(await listarPlanes()).toMatchObject([{ estado: 'hecho', valoracion: 5, comentario: 'top', fecha: HOY }])
  })
})
