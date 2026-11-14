import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorDeValidacion } from '../lib/validacion'
import { abrirBase, usarBase, type BaseLocal } from '../sync/bd'
import { listarPendientes } from '../sync/cola'
import { ErrorNoEncontrado } from './base'
import { borrarCumple, crearCumple, editarCumple, listarCumpleanos } from './cumpleanos'

let base: BaseLocal
const hoy = '2026-11-14'
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

describe('cumpleaños', () => {
  it('crear, editar y borrar (y todo va a la cola)', async () => {
    const c = await crearCumple({ nombre: ' Lucía ', dia: '29', mes: '2', anio: '2004', notas: '' }, hoy)
    expect(c).toMatchObject({ nombre: 'Lucía', dia: 29, mes: 2, anio: 2004, notas: '' })
    const e = await editarCumple(c.id, { nombre: 'Lucía', dia: '3', mes: '5', anio: '', notas: 'libros' }, hoy)
    expect(e).toMatchObject({ dia: 3, mes: 5, anio: null, notas: 'libros' })
    await borrarCumple(c.id)
    expect(await listarCumpleanos()).toEqual([])
    expect((await listarPendientes(base)).map((x) => x.op)).toEqual(['delete'])
    await expect(editarCumple(c.id, { nombre: 'x', dia: '1', mes: '1', anio: '', notas: '' }, hoy)).rejects.toThrow(ErrorNoEncontrado)
  })
  it('un 29 de febrero de un año no bisiesto no se guarda', async () => {
    await expect(crearCumple({ nombre: 'x', dia: '29', mes: '2', anio: '2003', notas: '' }, hoy)).rejects.toThrow(ErrorDeValidacion)
    expect(await listarCumpleanos()).toEqual([])
  })
})
