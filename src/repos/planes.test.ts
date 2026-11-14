import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorDeValidacion } from '../lib/validacion'
import { abrirBase, usarBase, type BaseLocal } from '../sync/bd'
import { crearIdea, listarIdeas } from './ideas'
import { borrarPlan, crearPlan, deshacerHecho, editarPlan, listarPlanes, marcarHecho } from './planes'

let base: BaseLocal
const datos = { titulo: 'Cine', tipo: 'actividad', con_quien: 'Ana', fecha: '', coste: '', notas: '' }
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

describe('planes', () => {
  it('sin fecha nace idea; con fecha, planeado; quitarle la fecha lo devuelve a idea', async () => {
    const p = await crearPlan(datos)
    expect(p).toMatchObject({ estado: 'idea', fecha: null, valoracion: null, comentario: '' })
    expect((await editarPlan(p.id, { ...datos, fecha: '2026-12-01', coste: '15' }))).toMatchObject({ estado: 'planeado', fecha: '2026-12-01', coste_centimos: 1500 })
    expect((await editarPlan(p.id, datos)).estado).toBe('idea')
  })
  it('hecho con valoración y comentario; sin fecha se le pone la de hoy; deshacer quita la valoración', async () => {
    const p = await crearPlan(datos)
    const h = await marcarHecho(p.id, '4', ' genial ', '2026-11-14')
    expect(h).toMatchObject({ estado: 'hecho', valoracion: 4, comentario: 'genial', fecha: '2026-11-14' })
    expect(await editarPlan(p.id, { ...datos, fecha: '2026-11-14', titulo: 'Cine (editado)' })).toMatchObject({ estado: 'hecho', valoracion: 4 })
    expect(await deshacerHecho(p.id)).toMatchObject({ estado: 'planeado', valoracion: null, comentario: '' })
  })
  it('valoración fuera de 1-5 no se guarda', async () => {
    const p = await crearPlan(datos)
    await expect(marcarHecho(p.id, 6, '', '2026-11-14')).rejects.toThrow(ErrorDeValidacion)
    expect((await listarPlanes())[0].estado).toBe('idea')
  })
  it('desde una idea: crea el plan y quita la idea a la vez', async () => {
    const i = await crearIdea('Escapada a Cantabria')
    await crearPlan({ ...datos, titulo: 'Escapada a Cantabria', tipo: 'viaje' }, i.id)
    expect(await listarIdeas()).toEqual([])
    await borrarPlan((await listarPlanes())[0].id)
    expect(await listarPlanes()).toEqual([])
  })
})
