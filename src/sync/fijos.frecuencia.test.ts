// Cambiar la frecuencia de un fijo (repositorio + IndexedDB de mentira):
// "cuenta desde hoy" y no se salta lo que toca después del cambio.

import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { aplicarFijos, borrarFijo, crearFijo, editarFijo, pausarFijo, type DatosFijo } from '../repos/fijos'
import { listarMovimientos } from '../repos/movimientos'
import { reiniciarEstado } from './avisos'
import { abrirBase, usarBase, type BaseLocal } from './bd'

let base: BaseLocal | null = null
const clase: DatosFijo = { tipo: 'gasto', concepto: 'Clase', importe: '20', frecuencia: 'semanal', dia: '3', mes: '', categoria: 'estudios', necesidad: 'esencial' }
const fechas = async () => (await listarMovimientos()).map((m) => m.fecha).sort()

beforeEach(async () => {
  reiniciarEstado()
  vi.stubGlobal('indexedDB', new IDBFactory())
  base = await abrirBase('usuario-1')
  usarBase(Promise.resolve(base))
})

afterEach(() => {
  base?.cerrar()
  usarBase(null)
  vi.unstubAllGlobals()
})

describe('cambiar la frecuencia', () => {
  it('de semanal a mensual el 12/11 con día 20: el 20 de noviembre se apunta', async () => {
    const f = await crearFijo(clase, '2026-11-09')
    expect(await aplicarFijos('2026-11-11')).toBe(1)
    await editarFijo(f.id, { ...clase, frecuencia: 'mensual', dia: '20' }, '2026-11-12')
    expect(await aplicarFijos('2026-11-20')).toBe(1)
    expect(await fechas()).toEqual(['2026-11-11', '2026-11-20'])
  })

  it('de semanal a anual el 12/11 con el 1 de diciembre: se apunta el 1/12/2026, no en 2027', async () => {
    const f = await crearFijo(clase, '2026-11-09')
    expect(await aplicarFijos('2026-11-11')).toBe(1)
    await editarFijo(f.id, { ...clase, frecuencia: 'anual', dia: '1', mes: '12' }, '2026-11-12')
    expect(await aplicarFijos('2026-12-01')).toBe(1)
    expect(await fechas()).toEqual(['2026-11-11', '2026-12-01'])
  })

  it('de mensual a semanal el mismo día que se apuntó: no se cobra dos veces ese día', async () => {
    const f = await crearFijo({ ...clase, frecuencia: 'mensual', dia: '11' }, '2026-11-09')
    expect(await aplicarFijos('2026-11-11')).toBe(1)
    await editarFijo(f.id, { ...clase, frecuencia: 'semanal', dia: '3' }, '2026-11-11')
    expect(await aplicarFijos('2026-11-11')).toBe(0)
    expect(await aplicarFijos('2026-11-18')).toBe(1)
    expect(await fechas()).toEqual(['2026-11-11', '2026-11-18'])
  })

  it('cambiar solo el importe o el día no cambia lo ya apuntado ni lo repite', async () => {
    const f = await crearFijo(clase, '2026-11-09')
    expect(await aplicarFijos('2026-11-11')).toBe(1)
    await editarFijo(f.id, { ...clase, importe: '25', dia: '5' }, '2026-11-12')
    expect(await aplicarFijos('2026-11-13')).toBe(0)
    expect(await aplicarFijos('2026-11-20')).toBe(1)
    expect((await listarMovimientos()).map((m) => [m.fecha, m.importe_centimos]).sort()).toEqual([
      ['2026-11-11', 2000],
      ['2026-11-20', 2500],
    ])
  })

  const cafe = { ...clase, concepto: 'Café', importe: '1,50', frecuencia: 'diaria', dia: '', categoria: 'comida', necesidad: 'prescindible' }
  const apuntes = async () => (await listarMovimientos()).sort((a, b) => a.fecha.localeCompare(b.fecha)).map((m) => [m.fecha, m.concepto, m.importe_centimos])

  it('diaria pausada el miércoles y reanudada el viernes: se cobran lunes, martes, viernes, sábado y domingo', async () => {
    const f = await crearFijo(cafe, '2026-11-09')
    await pausarFijo(f.id, true, '2026-11-11') // activo lunes 9 y martes 10
    await pausarFijo(f.id, false, '2026-11-13')
    expect(await aplicarFijos('2026-11-15')).toBe(1)
    expect(await apuntes()).toEqual([
      ['2026-11-10', 'Café (2 días)', 300],
      ['2026-11-15', 'Café (3 días)', 450],
    ])
    expect((await listarMovimientos()).every((m) => m.fijo_id === f.id && m.necesidad === 'prescindible' && m.categoria === 'comida')).toBe(true)
  })

  it('diaria pausada a mitad de semana y sin reanudar: esa semana se cobra hasta el día antes de la pausa', async () => {
    const f = await crearFijo(cafe, '2026-11-11')
    await pausarFijo(f.id, true, '2026-11-14') // miércoles 11, jueves 12 y viernes 13
    expect(await aplicarFijos('2026-11-30')).toBe(0)
    expect(await apuntes()).toEqual([['2026-11-13', 'Café (3 días)', 450]])
  })

  it('diaria pausada con semanas atrasadas sin apuntar: primero las pone al día', async () => {
    const f = await crearFijo(cafe, '2026-11-02')
    await pausarFijo(f.id, true, '2026-11-11')
    expect(await apuntes()).toEqual([
      ['2026-11-08', 'Café (7 días)', 1050],
      ['2026-11-10', 'Café (2 días)', 300],
    ])
  })

  it('pausar el lunes (o el mismo día que empieza) no apunta nada', async () => {
    const f = await crearFijo(cafe, '2026-11-09')
    await pausarFijo(f.id, true, '2026-11-09')
    expect(await listarMovimientos()).toEqual([])
    const g = await crearFijo(cafe, '2026-11-12')
    await pausarFijo(g.id, true, '2026-11-12')
    expect(await listarMovimientos()).toEqual([])
  })

  it('pausar el domingo con la semana ya apuntada no cobra nada más', async () => {
    const f = await crearFijo(cafe, '2026-11-09')
    expect(await aplicarFijos('2026-11-15')).toBe(1)
    await pausarFijo(f.id, true, '2026-11-15')
    expect(await apuntes()).toEqual([['2026-11-15', 'Café (7 días)', 1050]])
  })

  it('pausar, reanudar y volver a pausar la misma semana: dos apuntes parciales distintos', async () => {
    const f = await crearFijo(cafe, '2026-11-09')
    await pausarFijo(f.id, true, '2026-11-11') // lunes y martes
    await pausarFijo(f.id, false, '2026-11-12')
    await pausarFijo(f.id, true, '2026-11-14') // jueves y viernes
    expect(await aplicarFijos('2026-11-15')).toBe(0)
    expect(await apuntes()).toEqual([
      ['2026-11-10', 'Café (2 días)', 300],
      ['2026-11-13', 'Café (2 días)', 300],
    ])
  })

  it('dar de baja una diaria a mitad de semana cobra los días activos y deja lo apuntado', async () => {
    const f = await crearFijo(cafe, '2026-11-09')
    await borrarFijo(f.id, '2026-11-12')
    expect(await apuntes()).toEqual([['2026-11-11', 'Café (3 días)', 450]])
  })

  it('pausar un fijo semanal o mensual no crea apuntes parciales', async () => {
    const f = await crearFijo(clase, '2026-11-09')
    await pausarFijo(f.id, true, '2026-11-10')
    expect(await listarMovimientos()).toEqual([])
  })
})
