// Efectivo o tarjeta en los repositorios: filas locales antiguas (sin
// `medio`), editar, y lo que apuntan los fijos.

import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { medioDe } from '../lib/dinero'
import { abrirBase, pedir, usarBase, type BaseLocal } from '../sync/bd'
import { crearDeseo, marcarComprado } from './deseos'
import { aplicarFijos, crearFijo, editarFijo, listarFijos, pausarFijo, type DatosFijo } from './fijos'
import { crearMovimiento, editarMovimiento, listarMovimientos } from './movimientos'

let base: BaseLocal
const bocadillo: DatosFijo = { tipo: 'gasto', concepto: 'Bocadillo', importe: '3', dia: '1', categoria: '', frecuencia: 'mensual', mes: '', necesidad: '', medio: 'efectivo' }

/** Quita `medio` de la fila guardada, como una fila bajada antes de la migración. */
async function quitarMedio(tabla: string, id: string) {
  await base.tx([tabla], 'readwrite', async (t) => {
    const almacen = t.objectStore(tabla)
    const fila = (await pedir(almacen.get(id))) as Record<string, unknown>
    delete fila.medio
    almacen.put(fila)
  })
}

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

describe('efectivo o tarjeta en movimientos antiguos', () => {
  it('un movimiento local sin medio cuenta como tarjeta y al editarlo se guarda el que se elija', async () => {
    const m = await crearMovimiento({ tipo: 'gasto', concepto: 'Viejo', importe: '5,10', fecha: '2026-10-31' })
    await quitarMedio('movimientos', m.id)
    const [local] = await listarMovimientos()
    expect('medio' in local).toBe(false)
    expect(medioDe(local)).toBe('tarjeta')
    // Editar como lo hace la pantalla (datosDe → medioDe): sigue en tarjeta
    expect((await editarMovimiento(m.id, { tipo: 'gasto', concepto: 'Viejo', importe: '5,10', fecha: '2026-10-31', medio: medioDe(local) })).medio).toBe('tarjeta')
    const editado = await editarMovimiento(m.id, { tipo: 'gasto', concepto: 'Viejo', importe: '5,10', fecha: '2026-10-31', medio: 'efectivo' })
    expect(editado).toMatchObject({ medio: 'efectivo', importe_centimos: 510 })
  })

  it('pasar un ingreso a gasto conserva el medio', async () => {
    const m = await crearMovimiento({ tipo: 'ingreso', concepto: 'Paga', importe: '10', fecha: '2026-11-15', medio: 'efectivo' })
    expect((await editarMovimiento(m.id, { tipo: 'gasto', concepto: 'Paga', importe: '10', fecha: '2026-11-15', medio: m.medio })).medio).toBe('efectivo')
  })

  it('el gasto que apunta un deseo comprado va con tarjeta', async () => {
    const d = await crearDeseo({ articulo: 'Cascos', precio: '49,99', prioridad: 'alta', enlace: '', notas: '' })
    await marcarComprado(d.id, true, '2026-11-15')
    expect((await listarMovimientos())[0]).toMatchObject({ medio: 'tarjeta', importe_centimos: 4999 })
  })
})

describe('efectivo o tarjeta en los fijos', () => {
  it('un fijo local sin medio apunta en tarjeta y apuntar no le inventa un medio', async () => {
    const f = await crearFijo({ ...bocadillo, medio: undefined }, '2026-10-01')
    await quitarMedio('movimientos_fijos', f.id)
    expect(await aplicarFijos('2026-11-15')).toBe(2) // octubre y noviembre
    expect((await listarMovimientos()).map((m) => m.medio)).toEqual(['tarjeta', 'tarjeta'])
    const [fijo] = await listarFijos()
    expect(medioDe(fijo)).toBe('tarjeta')
  })

  it('cambiar el medio de un fijo afecta a lo que apunte desde entonces, no a lo ya apuntado', async () => {
    const f = await crearFijo(bocadillo, '2026-09-01')
    expect(await aplicarFijos('2026-10-15')).toBe(2) // septiembre y octubre
    expect((await editarFijo(f.id, { ...bocadillo, medio: 'tarjeta' }, '2026-10-15')).medio).toBe('tarjeta')
    await aplicarFijos('2026-11-15')
    const porFecha = Object.fromEntries((await listarMovimientos()).map((m) => [m.fecha, m.medio]))
    expect(porFecha).toEqual({ '2026-09-01': 'efectivo', '2026-10-01': 'efectivo', '2026-11-01': 'tarjeta' })
  })

  it('editar un fijo sin decir el medio lo deja en tarjeta (lo que enseña la pantalla si no hay)', async () => {
    const f = await crearFijo(bocadillo, '2026-11-15')
    expect((await editarFijo(f.id, { ...bocadillo, medio: '' }, '2026-11-15')).medio).toBe('tarjeta')
  })

  it('pausar y reanudar no cambia el medio', async () => {
    const f = await crearFijo(bocadillo, '2026-11-15')
    expect((await pausarFijo(f.id, true, '2026-11-15')).medio).toBe('efectivo')
    expect((await pausarFijo(f.id, false, '2026-11-20')).medio).toBe('efectivo')
  })

  it('el apunte parcial de un fijo diario en efectivo al pausarlo sale en efectivo', async () => {
    // Lunes 09/11/2026; se pausa el jueves 12: se apuntan lunes a miércoles
    const f = await crearFijo({ ...bocadillo, frecuencia: 'diaria', dia: '' }, '2026-11-09')
    await pausarFijo(f.id, true, '2026-11-12')
    const apuntados = await listarMovimientos()
    expect(apuntados.length).toBe(1)
    expect(apuntados[0]).toMatchObject({ medio: 'efectivo', importe_centimos: 900 })
  })

  it('un medio fuera de la lista no se guarda en un fijo', async () => {
    await expect(crearFijo({ ...bocadillo, medio: 'bizum' }, '2026-11-15')).rejects.toThrow('tarjeta')
    expect(await listarFijos()).toEqual([])
  })
})
