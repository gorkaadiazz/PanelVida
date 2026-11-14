// Bandeja de ideas sobre un IndexedDB de mentira.
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorDeValidacion } from '../lib/validacion'
import { abrirBase, usarBase, type BaseLocal } from '../sync/bd'
import { listarPendientes } from '../sync/cola'
import { ErrorNoEncontrado } from './base'
import { archivarIdea, borrarIdea, crearIdea, listarIdeas } from './ideas'
import { crearTarea, listarTareas } from './tareas'

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
})

describe('ideas', () => {
  it('se guarda en un toque, limpia y sin procesar', async () => {
    const i = await crearIdea('  ir al   cine ')
    expect(i).toMatchObject({ texto: 'ir al cine', archivada: false })
    expect(await cola()).toEqual(['upsert ideas'])
  })
  it('una idea vacía no se guarda', async () => {
    await expect(crearIdea('   ')).rejects.toThrow(ErrorDeValidacion)
    expect(await listarIdeas()).toEqual([])
  })
  it('archivar, recuperar y borrar', async () => {
    const i = await crearIdea('x')
    expect((await archivarIdea(i.id, true)).archivada).toBe(true)
    expect((await archivarIdea(i.id, false)).archivada).toBe(false)
    await borrarIdea(i.id)
    expect(await listarIdeas()).toEqual([])
    await expect(archivarIdea(i.id, true)).rejects.toThrow(ErrorNoEncontrado)
  })
  it('convertir en tarea crea la tarea y quita la idea en la misma operación', async () => {
    const i = await crearIdea('Llamar al dentista')
    await crearTarea({ texto: 'Llamar al dentista', fecha_limite: '2026-11-20' }, i.id)
    expect(await listarIdeas()).toEqual([])
    expect((await listarTareas()).map((t) => t.texto)).toEqual(['Llamar al dentista'])
  })
  it('si la tarea no vale, la idea se queda', async () => {
    const i = await crearIdea('x')
    await expect(crearTarea({ texto: '' }, i.id)).rejects.toThrow(ErrorDeValidacion)
    expect(await listarIdeas()).toHaveLength(1)
  })
  it('si la idea ya no existe (borrada en otro dispositivo), la tarea se crea igual', async () => {
    await crearTarea({ texto: 'algo' }, '00000000-0000-4000-8000-000000000999')
    expect(await listarTareas()).toHaveLength(1)
  })
})
