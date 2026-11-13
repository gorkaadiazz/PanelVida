// Repositorios de hábitos y tareas sobre un IndexedDB de mentira
// (fake-indexeddb). Aquí no hay servidor: se comprueba lo que queda en la
// copia local y en la cola de cambios pendientes.

import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hoy, restarDias, sumarDias } from '../lib/fechas'
import { idMarca } from '../lib/uuid'
import { ErrorDeValidacion } from '../lib/validacion'
import { alCambioLocal, versionDe } from '../sync/avisos'
import { abrirBase, usarBase, type BaseLocal } from '../sync/bd'
import { listarPendientes } from '../sync/cola'
import { ErrorNoEncontrado, listarPorIndice, obtener, sellar, transaccion } from './base'
import {
  alternarDia,
  borrarHabito,
  crearHabito,
  editarHabito,
  listarHabitos,
  listarMarcas,
  marcarDia,
  reordenarHabitos,
} from './habitos'
import { borrarTarea, crearTarea, editarTarea, listarTareas, marcarTarea, quitarHechas } from './tareas'

let base: BaseLocal

const cola = async () => (await listarPendientes(base)).map((e) => `${e.op} ${e.tabla}`).sort()

beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  base = await abrirBase('usuario-1')
  usarBase(Promise.resolve(base))
})

afterEach(() => {
  base.cerrar()
  usarBase(null)
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('hábitos', () => {
  it('crear: limpia el nombre, lo pone al final y lo apunta en la cola', async () => {
    const a = await crearHabito('  Gimnasio ')
    const b = await crearHabito('Leer 20 min')
    expect(a).toMatchObject({ nombre: 'Gimnasio', orden: 0, archivado: false })
    expect(b.orden).toBe(1)
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(a.created_at).toBe(a.updated_at)
    expect((await listarHabitos()).map((h) => h.nombre)).toEqual(['Gimnasio', 'Leer 20 min'])
    expect(await cola()).toEqual(['upsert habitos', 'upsert habitos'])
  })

  it('crear o editar con un nombre no válido rechaza y no guarda nada', async () => {
    await expect(crearHabito('   ')).rejects.toBeInstanceOf(ErrorDeValidacion)
    await expect(crearHabito('x'.repeat(61))).rejects.toBeInstanceOf(ErrorDeValidacion)
    const h = await crearHabito('Leer')
    await expect(editarHabito(h.id, { nombre: '' })).rejects.toBeInstanceOf(ErrorDeValidacion)
    await expect(editarHabito(h.id, { orden: 1.5 })).rejects.toBeInstanceOf(ErrorDeValidacion)
    expect((await listarHabitos()).map((x) => x.nombre)).toEqual(['Leer'])
  })

  it('editar: cambia solo lo indicado y avanza updated_at', async () => {
    const h = await crearHabito('Leer')
    const editado = await editarHabito(h.id, { archivado: true })
    expect(editado).toMatchObject({ id: h.id, nombre: 'Leer', archivado: true, created_at: h.created_at })
    expect(Date.parse(editado.updated_at)).toBeGreaterThan(Date.parse(h.updated_at))
    expect(await cola()).toEqual(['upsert habitos']) // una sola entrada por fila
  })

  it('editar o marcar un hábito que ya no existe da ErrorNoEncontrado', async () => {
    await expect(editarHabito('00000000-0000-4000-8000-000000000000', { nombre: 'x' })).rejects.toBeInstanceOf(ErrorNoEncontrado)
    await expect(marcarDia('00000000-0000-4000-8000-000000000000', hoy(), true)).rejects.toBeInstanceOf(ErrorNoEncontrado)
    expect(await cola()).toEqual([])
  })

  it('reordenar: guarda solo los que cambian de posición', async () => {
    const a = await crearHabito('A')
    const b = await crearHabito('B')
    const c = await crearHabito('C')
    await base.tx(['cola'], 'readwrite', (t) => void t.objectStore('cola').clear())

    await reordenarHabitos([c.id, a.id, b.id])
    expect((await listarHabitos()).map((h) => h.nombre)).toEqual(['C', 'A', 'B'])
    expect(await cola()).toHaveLength(3)

    await base.tx(['cola'], 'readwrite', (t) => void t.objectStore('cola').clear())
    await reordenarHabitos([c.id, b.id, a.id, 'no-existe'])
    expect((await listarHabitos()).map((h) => h.nombre)).toEqual(['C', 'B', 'A'])
    expect(await cola()).toHaveLength(2) // C no se ha movido
  })

  it('borrar: se lleva sus marcas (y sus pendientes) y apunta un único borrado', async () => {
    const a = await crearHabito('A')
    const b = await crearHabito('B')
    await marcarDia(a.id, hoy(), true)
    await marcarDia(a.id, restarDias(hoy(), 1), true)
    await marcarDia(b.id, hoy(), true)

    await borrarHabito(a.id)
    expect((await listarHabitos()).map((h) => h.nombre)).toEqual(['B'])
    expect((await listarMarcas()).map((m) => m.habito_id)).toEqual([b.id])
    expect(await cola()).toEqual(['delete habitos', 'upsert habito_marcas', 'upsert habitos'])
  })
})

describe('marcas de hábitos', () => {
  it('marcar crea la fila con el id determinista del hábito y el día', async () => {
    const h = await crearHabito('Leer')
    const marca = await marcarDia(h.id, hoy(), true)
    expect(marca).toMatchObject({ id: idMarca(h.id, hoy()), habito_id: h.id, fecha: hoy(), hecho: true })
    expect(await listarMarcas()).toHaveLength(1)
  })

  it('desmarcar NO borra la fila: la deja con hecho = false', async () => {
    const h = await crearHabito('Leer')
    const marcada = await marcarDia(h.id, hoy(), true)
    const desmarcada = await marcarDia(h.id, hoy(), false)
    expect(desmarcada).toMatchObject({ id: marcada.id, hecho: false, created_at: marcada.created_at })
    expect(await listarMarcas()).toHaveLength(1)
    expect(await cola()).toEqual(['upsert habito_marcas', 'upsert habitos'])
  })

  it('marcar lo que ya estaba igual no cambia nada (ni updated_at)', async () => {
    const h = await crearHabito('Leer')
    const primera = await marcarDia(h.id, hoy(), true)
    const repetida = await marcarDia(h.id, hoy(), true)
    expect(repetida.updated_at).toBe(primera.updated_at)
  })

  it('alternar cambia al estado contrario', async () => {
    const h = await crearHabito('Leer')
    const ayer = restarDias(hoy(), 1)
    expect((await alternarDia(h.id, ayer)).hecho).toBe(true)
    expect((await alternarDia(h.id, ayer)).hecho).toBe(false)
    expect((await alternarDia(h.id, ayer)).hecho).toBe(true)
    expect(await listarMarcas()).toHaveLength(1)
  })

  it('se puede corregir un día pasado, pero no marcar el futuro ni una fecha imposible', async () => {
    const h = await crearHabito('Leer')
    await expect(marcarDia(h.id, restarDias(hoy(), 6), true)).resolves.toMatchObject({ hecho: true })
    await expect(marcarDia(h.id, sumarDias(hoy(), 1), true)).rejects.toBeInstanceOf(ErrorDeValidacion)
    await expect(marcarDia(h.id, '2026-02-30', true)).rejects.toBeInstanceOf(ErrorDeValidacion)
    await expect(alternarDia(h.id, 'ayer')).rejects.toBeInstanceOf(ErrorDeValidacion)
  })

  it('listarMarcas(desde) filtra por día y el índice por hábito funciona', async () => {
    const h = await crearHabito('Leer')
    await marcarDia(h.id, restarDias(hoy(), 10), true)
    await marcarDia(h.id, restarDias(hoy(), 2), true)
    await marcarDia(h.id, hoy(), true)
    expect(await listarMarcas()).toHaveLength(3)
    expect((await listarMarcas(restarDias(hoy(), 2))).map((m) => m.fecha).sort()).toEqual([restarDias(hoy(), 2), hoy()])
    expect(await listarPorIndice('habito_marcas', 'habito_id', h.id)).toHaveLength(3)
  })
})

describe('tareas', () => {
  it('crear: valida, normaliza la fecha vacía y la deja pendiente', async () => {
    const sinFecha = await crearTarea({ texto: '  Comprar   pan ', fecha_limite: '' })
    expect(sinFecha).toMatchObject({ texto: 'Comprar pan', fecha_limite: null, hecha: false, hecha_en: null })
    const conFecha = await crearTarea({ texto: 'Entregar práctica', fecha_limite: '2026-11-20' })
    expect(conFecha.fecha_limite).toBe('2026-11-20')

    await expect(crearTarea({ texto: '' })).rejects.toBeInstanceOf(ErrorDeValidacion)
    await expect(crearTarea({ texto: 'x'.repeat(201) })).rejects.toBeInstanceOf(ErrorDeValidacion)
    await expect(crearTarea({ texto: 'x', fecha_limite: '20/11/2026' })).rejects.toBeInstanceOf(ErrorDeValidacion)
    expect(await listarTareas()).toHaveLength(2)
  })

  it('listar las devuelve ya ordenadas', async () => {
    await crearTarea({ texto: 'sin fecha' })
    await crearTarea({ texto: 'lejana', fecha_limite: '2027-01-10' })
    await crearTarea({ texto: 'cercana', fecha_limite: '2026-11-14' })
    const hecha = await crearTarea({ texto: 'hecha', fecha_limite: '2026-01-01' })
    await marcarTarea(hecha.id, true)
    expect((await listarTareas()).map((t) => t.texto)).toEqual(['cercana', 'lejana', 'sin fecha', 'hecha'])
  })

  it('editar: cambia texto y fecha por separado; quitar la fecha con null', async () => {
    const t = await crearTarea({ texto: 'Uno', fecha_limite: '2026-11-20' })
    expect(await editarTarea(t.id, { texto: 'Dos' })).toMatchObject({ texto: 'Dos', fecha_limite: '2026-11-20' })
    expect(await editarTarea(t.id, { fecha_limite: null })).toMatchObject({ texto: 'Dos', fecha_limite: null })
    await expect(editarTarea(t.id, { texto: ' ' })).rejects.toBeInstanceOf(ErrorDeValidacion)
    await expect(editarTarea('no-existe', { texto: 'x' })).rejects.toBeInstanceOf(ErrorNoEncontrado)
  })

  it('marcar como hecha apunta cuándo; volver a pendiente lo quita', async () => {
    const t = await crearTarea({ texto: 'Uno' })
    const hecha = await marcarTarea(t.id, true)
    expect(hecha.hecha).toBe(true)
    expect(Number.isNaN(Date.parse(hecha.hecha_en ?? ''))).toBe(false)
    expect(await marcarTarea(t.id, false)).toMatchObject({ hecha: false, hecha_en: null })
    await expect(marcarTarea('no-existe', true)).rejects.toBeInstanceOf(ErrorNoEncontrado)
  })

  it('quitarHechas borra solo las hechas, dice cuántas y apunta cada borrado', async () => {
    const a = await crearTarea({ texto: 'a' })
    const b = await crearTarea({ texto: 'b' })
    await crearTarea({ texto: 'c' })
    await marcarTarea(a.id, true)
    await marcarTarea(b.id, true)

    expect(await quitarHechas()).toBe(2)
    expect((await listarTareas()).map((t) => t.texto)).toEqual(['c'])
    expect(await cola()).toEqual(['delete tareas', 'delete tareas', 'upsert tareas'])
    expect(await quitarHechas()).toBe(0)
  })

  it('borrar una tarea', async () => {
    const t = await crearTarea({ texto: 'a' })
    await borrarTarea(t.id)
    expect(await obtener('tareas', t.id)).toBeUndefined()
    expect(await cola()).toEqual(['delete tareas'])
  })
})

describe('transacciones y avisos', () => {
  it('si algo falla a mitad, no se guarda nada (ni filas ni cola) y no se avisa', async () => {
    const avisos = vi.fn()
    const soltar = alCambioLocal(avisos)
    await expect(
      transaccion(async (e) => {
        e.crear('tareas', { texto: 'No debe quedar', fecha_limite: null, hecha: false, hecha_en: null })
        await e.todos('tareas')
        throw new ErrorNoEncontrado('fallo a mitad')
      }),
    ).rejects.toBeInstanceOf(ErrorNoEncontrado)
    soltar()
    expect(await listarTareas()).toEqual([])
    expect(await cola()).toEqual([])
    expect(avisos).not.toHaveBeenCalled()
  })

  it('cada cambio avisa a los lectores de esa tabla y pide una subida', async () => {
    const avisos = vi.fn()
    const soltar = alCambioLocal(avisos)
    const antesTareas = versionDe(['tareas'])
    const antesHabitos = versionDe(['habitos'])

    await crearTarea({ texto: 'a' })
    soltar()
    expect(versionDe(['tareas'])).toBe(antesTareas + 1)
    expect(versionDe(['habitos'])).toBe(antesHabitos)
    expect(avisos).toHaveBeenCalledTimes(1)
    expect(avisos).toHaveBeenCalledWith(['tareas'])
  })

  it('borrar un hábito avisa también a los lectores de sus marcas', async () => {
    const h = await crearHabito('A')
    await marcarDia(h.id, hoy(), true)
    const antes = versionDe(['habito_marcas'])
    await borrarHabito(h.id)
    expect(versionDe(['habito_marcas'])).toBe(antes + 1)
  })

  it('sellar: updated_at nunca retrocede aunque el reloj del dispositivo vaya atrasado', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-13T10:00:00.000Z'))
    expect(sellar()).toBe('2026-11-13T10:00:00.000Z')
    expect(sellar('2026-11-13T09:00:00.000Z')).toBe('2026-11-13T10:00:00.000Z')
    expect(sellar('2026-11-13T12:00:00.000Z')).toBe('2026-11-13T12:00:00.001Z')
    expect(sellar('2026-11-13T10:00:00+00:00')).toBe('2026-11-13T10:00:00.001Z')
    expect(sellar('basura')).toBe('2026-11-13T10:00:00.000Z')
  })
})

describe('"hoy" en hora de Madrid al marcar (casos límite añadidos por tester)', () => {
  it('a las 00:30 de Madrid (23:30 UTC) ya se puede marcar el día nuevo, y no el siguiente', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-13T23:30:00Z')) // en Madrid ya es 14/11
    const h = await crearHabito('Leer')
    await expect(marcarDia(h.id, '2026-11-14', true)).resolves.toMatchObject({ fecha: '2026-11-14', hecho: true })
    await expect(marcarDia(h.id, '2026-11-15', true)).rejects.toBeInstanceOf(ErrorDeValidacion)
  })

  it('en verano (UTC+2) a las 23:30 UTC ya es el día siguiente en Madrid', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-07-01T22:30:00Z')) // 00:30 del 2/7 en Madrid
    const h = await crearHabito('Leer')
    await expect(marcarDia(h.id, '2026-07-02', true)).resolves.toMatchObject({ hecho: true })
  })

  it('a las 23:30 de Madrid el día siguiente aún no se puede marcar', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-12-31T22:30:00Z')) // 23:30 del 31/12 en Madrid
    const h = await crearHabito('Leer')
    await expect(marcarDia(h.id, '2027-01-01', true)).rejects.toBeInstanceOf(ErrorDeValidacion)
    await expect(marcarDia(h.id, '2026-12-31', true)).resolves.toMatchObject({ hecho: true })
  })

  it('crear una tarea sin fecha con undefined', async () => {
    expect(await crearTarea({ texto: 'Sin fecha' })).toMatchObject({ fecha_limite: null })
  })
})
