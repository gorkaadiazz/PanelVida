import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorDeValidacion } from '../lib/validacion'
import { abrirBase, usarBase, type BaseLocal } from '../sync/bd'
import { listarPendientes } from '../sync/cola'
import { borrarDeseo, crearDeseo, devolverALista, editarDeseo, listarDeseos, marcarComprado } from './deseos'
import { crearIdea, listarIdeas } from './ideas'
import { listarMovimientos } from './movimientos'

let base: BaseLocal
const datos = { articulo: 'Auriculares', precio: '59,99', prioridad: 'alta', enlace: '', notas: '' }
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

describe('lista de deseos', () => {
  it('crear y editar', async () => {
    const d = await crearDeseo(datos)
    expect(d).toMatchObject({ articulo: 'Auriculares', precio_centimos: 5999, prioridad: 'alta', enlace: null, comprado: false, comprado_en: null })
    expect(await editarDeseo(d.id, { ...datos, enlace: 'tienda.es/a', prioridad: 'baja' })).toMatchObject({ enlace: 'https://tienda.es/a', prioridad: 'baja' })
  })
  it('un enlace peligroso no se guarda', async () => {
    await expect(crearDeseo({ ...datos, enlace: 'javascript:alert(1)' })).rejects.toThrow(ErrorDeValidacion)
    expect(await listarDeseos()).toEqual([])
  })
  it('comprado CON gasto: apunta el gasto (Compras, hoy) y lo pasa al historial en la misma operación', async () => {
    const d = await crearDeseo(datos)
    await marcarComprado(d.id, true, '2026-11-14')
    expect((await listarDeseos())[0]).toMatchObject({ comprado: true, comprado_en: '2026-11-14' })
    expect(await listarMovimientos()).toMatchObject([{ tipo: 'gasto', concepto: 'Auriculares', importe_centimos: 5999, fecha: '2026-11-14', categoria: 'compras' }])
    expect((await listarPendientes(base)).map((e) => e.tabla).sort()).toEqual(['deseos', 'movimientos'])
    // Marcarlo otra vez no apunta otro gasto
    await marcarComprado(d.id, true, '2026-11-15')
    expect(await listarMovimientos()).toHaveLength(1)
  })
  it('comprado SIN gasto: solo pasa al historial; devolver lo saca del historial', async () => {
    const d = await crearDeseo(datos)
    await marcarComprado(d.id, false, '2026-11-14')
    expect(await listarMovimientos()).toEqual([])
    expect(await devolverALista(d.id)).toMatchObject({ comprado: false, comprado_en: null })
    await borrarDeseo(d.id)
    expect(await listarDeseos()).toEqual([])
  })
  it('desde una idea: crea el deseo y quita la idea a la vez', async () => {
    const i = await crearIdea('Una bici')
    await crearDeseo({ ...datos, articulo: 'Una bici', precio: '300' }, i.id)
    expect(await listarIdeas()).toEqual([])
    expect(await listarDeseos()).toHaveLength(1)
  })
})
