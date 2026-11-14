// Movimientos fijos sobre un IndexedDB de mentira: categorías, apunte
// automático de cada mes y que nunca se apunte dos veces.

import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { idApunteFijo } from '../lib/fijos'
import { ErrorDeValidacion } from '../lib/validacion'
import { abrirBase, usarBase, type BaseLocal } from '../sync/bd'
import { listarPendientes } from '../sync/cola'
import { aplicarFijos, borrarFijo, crearFijo, editarFijo, listarFijos, pausarFijo, type DatosFijo } from './fijos'
import { borrarMovimiento, crearMovimiento, editarMovimiento, listarMovimientos } from './movimientos'

let base: BaseLocal
const cola = async () => (await listarPendientes(base)).map((e) => `${e.op} ${e.tabla}`).sort()
const gimnasio: DatosFijo = { tipo: 'gasto', concepto: 'Gimnasio', importe: '30', dia: '5', categoria: 'salud', frecuencia: 'mensual', mes: '', necesidad: '' }

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

describe('categoría en los movimientos', () => {
  it('se guarda en los gastos y se quita en los ingresos', async () => {
    const m = await crearMovimiento({ tipo: 'gasto', concepto: 'Súper', importe: '20', fecha: '2026-11-13', categoria: 'comida' })
    expect(m.categoria).toBe('comida')
    const ingreso = await editarMovimiento(m.id, { tipo: 'ingreso', concepto: 'Venta', importe: '20', fecha: '2026-11-13', categoria: 'comida' })
    expect(ingreso.categoria).toBeNull()
    expect((await crearMovimiento({ tipo: 'gasto', concepto: 'x', importe: '1', fecha: '2026-11-13', categoria: '' })).categoria).toBeNull()
  })

  it('una categoría que no es de la lista no se guarda', async () => {
    await expect(crearMovimiento({ tipo: 'gasto', concepto: 'x', importe: '1', fecha: '2026-11-13', categoria: 'Comida' })).rejects.toThrow(ErrorDeValidacion)
    expect(await listarMovimientos()).toEqual([])
  })
})

describe('fijos', () => {
  it('crear: empieza este mes si su día no ha pasado, si no el que viene', async () => {
    expect((await crearFijo({ ...gimnasio, dia: '20' }, '2026-11-14')).desde).toBe('2026-11')
    expect((await crearFijo(gimnasio, '2026-11-14')).desde).toBe('2026-12')
    expect(await cola()).toEqual(['upsert movimientos_fijos', 'upsert movimientos_fijos'])
  })

  it('valida día, importe y categoría', async () => {
    await expect(crearFijo({ ...gimnasio, dia: '0' }, '2026-11-14')).rejects.toThrow(ErrorDeValidacion)
    await expect(crearFijo({ ...gimnasio, dia: '32' }, '2026-11-14')).rejects.toThrow(ErrorDeValidacion)
    await expect(crearFijo({ ...gimnasio, importe: '0' }, '2026-11-14')).rejects.toThrow(ErrorDeValidacion)
    await expect(crearFijo({ ...gimnasio, categoria: 'gym' }, '2026-11-14')).rejects.toThrow(ErrorDeValidacion)
    expect(await listarFijos()).toEqual([])
  })

  it('apunta el movimiento cuando llega el día, con su categoría, y una sola vez', async () => {
    const f = await crearFijo({ ...gimnasio, dia: '20' }, '2026-11-14')
    expect(await aplicarFijos('2026-11-19')).toBe(0)
    expect(await aplicarFijos('2026-11-20')).toBe(1)
    expect(await aplicarFijos('2026-11-20')).toBe(0)
    expect(await aplicarFijos('2026-11-30')).toBe(0)
    const movs = await listarMovimientos()
    expect(movs).toHaveLength(1)
    expect(movs[0]).toMatchObject({ id: idApunteFijo(f.id, '2026-11'), tipo: 'gasto', concepto: 'Gimnasio', importe_centimos: 3000, fecha: '2026-11-20', categoria: 'salud', necesidad: null, fijo_id: f.id })
    expect((await listarFijos())[0]).toMatchObject({ ultimo_mes: '2026-11', ultimo_apunte: '2026-11-20' })
  })

  it('pone al día los meses atrasados', async () => {
    await crearFijo({ ...gimnasio, dia: '31' }, '2026-11-14')
    expect(await aplicarFijos('2027-02-28')).toBe(4)
    expect((await listarMovimientos()).map((m) => m.fecha).sort()).toEqual(['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28'])
  })

  it('si el usuario borra el apunte de un mes, no vuelve a aparecer', async () => {
    const f = await crearFijo({ ...gimnasio, dia: '1' }, '2026-11-01')
    await aplicarFijos('2026-11-01')
    await borrarMovimiento(idApunteFijo(f.id, '2026-11'))
    expect(await aplicarFijos('2026-11-15')).toBe(0)
    expect(await listarMovimientos()).toEqual([])
  })

  it('si otro dispositivo ya lo apuntó (mismo id), no se duplica ni se pisa', async () => {
    const f = await crearFijo({ ...gimnasio, dia: '1' }, '2026-11-01')
    // Lo que bajó del otro dispositivo: el apunte de noviembre, ya editado allí
    await base.tx(['movimientos'], 'readwrite', (t) => {
      t.objectStore('movimientos').put({
        id: idApunteFijo(f.id, '2026-11'), tipo: 'gasto', concepto: 'Gimnasio (editado)', importe_centimos: 2500,
        fecha: '2026-11-01', categoria: 'salud', created_at: '2026-11-01T08:00:00.000Z', updated_at: '2026-11-01T09:00:00.000Z',
      })
    })
    expect(await aplicarFijos('2026-11-02')).toBe(0)
    const movs = await listarMovimientos()
    expect(movs).toHaveLength(1)
    expect(movs[0].concepto).toBe('Gimnasio (editado)')
    expect((await listarFijos())[0].ultimo_mes).toBe('2026-11')
  })

  it('en pausa no apunta; al reanudar no recupera los meses parados', async () => {
    const f = await crearFijo({ ...gimnasio, dia: '1' }, '2026-11-01')
    await aplicarFijos('2026-11-01')
    await pausarFijo(f.id, true, '2026-11-10')
    expect(await aplicarFijos('2027-02-01')).toBe(0)
    await pausarFijo(f.id, false, '2027-02-10')
    expect(await aplicarFijos('2027-02-10')).toBe(0)
    expect(await aplicarFijos('2027-03-01')).toBe(1)
    expect((await listarMovimientos()).map((m) => m.fecha).sort()).toEqual(['2026-11-01', '2027-03-01'])
  })

  it('editar cambia los meses que vienen; borrar el fijo deja lo ya apuntado', async () => {
    const f = await crearFijo({ ...gimnasio, dia: '1' }, '2026-11-01')
    await aplicarFijos('2026-11-01')
    await editarFijo(f.id, { ...gimnasio, dia: '1', importe: '35' }, '2026-11-01')
    await aplicarFijos('2026-12-01')
    expect((await listarMovimientos()).map((m) => m.importe_centimos).sort()).toEqual([3000, 3500])
    await borrarFijo(f.id, '2026-12-01')
    expect(await listarFijos()).toEqual([])
    expect(await listarMovimientos()).toHaveLength(2)
  })

  it('un ingreso fijo no lleva categoría', async () => {
    const f = await crearFijo({ tipo: 'ingreso', concepto: 'Paga', importe: '50', dia: '1', categoria: 'ocio', frecuencia: 'mensual', mes: '', necesidad: 'esencial' }, '2026-11-01')
    expect(f.categoria).toBeNull()
    await aplicarFijos('2026-11-01')
    expect((await listarMovimientos())[0]).toMatchObject({ tipo: 'ingreso', categoria: null })
  })
})
