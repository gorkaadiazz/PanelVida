// Casos límite de los repositorios de la fase 8 sobre un IndexedDB de mentira.
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { repartirAhorro } from '../lib/deseos'
import { resumir } from '../lib/dinero'
import { ErrorDeValidacion } from '../lib/validacion'
import { abrirBase, usarBase, type BaseLocal } from '../sync/bd'
import { listarPendientes } from '../sync/cola'
import { ErrorNoEncontrado } from './base'
import { borrarDeseo, crearDeseo, devolverALista, listarDeseos, marcarComprado } from './deseos'
import { borrarIdea, crearIdea, listarIdeas } from './ideas'
import { crearMovimiento, listarMovimientos } from './movimientos'
import { borrarPlan, crearPlan, deshacerHecho, editarPlan, listarPlanes, marcarHecho, type Plan } from './planes'
import { crearTarea, listarTareas } from './tareas'

let base: BaseLocal
const plan = { titulo: 'Cine', tipo: 'actividad', con_quien: '', fecha: '', coste: '', notas: '' }
const deseo = { articulo: 'Auriculares', precio: '59,99', prioridad: 'alta', enlace: '', notas: '' }
const cola = async () => (await listarPendientes(base)).map((e) => `${e.op} ${e.tabla}`).sort()

/** Las mismas restricciones que la tabla planes del servidor. */
function cumpleRestricciones(p: Plan) {
  if (p.estado === 'planeado') expect(p.fecha, 'planeado sin fecha').not.toBeNull()
  if (p.valoracion !== null) expect(p.estado, 'valoración sin hecho').toBe('hecho')
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

describe('ideas convertidas cuando la idea ya no existe', () => {
  const NO_EXISTE = '00000000-0000-4000-8000-00000000dead'
  it('plan y deseo se crean igual y no se encola ningún borrado', async () => {
    await crearPlan(plan, NO_EXISTE)
    await crearDeseo(deseo, NO_EXISTE)
    expect(await listarPlanes()).toHaveLength(1)
    expect(await listarDeseos()).toHaveLength(1)
    expect(await cola()).toEqual(['upsert deseos', 'upsert planes'])
  })
  it('convertir la misma idea dos veces (dos pestañas): la segunda crea sin fallar y la idea se borra una vez', async () => {
    const i = await crearIdea('Viaje a Roma')
    await crearPlan({ ...plan, titulo: 'Roma' }, i.id)
    await crearDeseo({ ...deseo, articulo: 'Maleta' }, i.id)
    expect(await listarIdeas()).toEqual([])
    expect(await cola()).toEqual(['delete ideas', 'upsert deseos', 'upsert planes'])
  })
  it('si el plan o el deseo no valen, la idea se queda (nada a medias)', async () => {
    const i = await crearIdea('x')
    await expect(crearPlan({ ...plan, titulo: ' ' }, i.id)).rejects.toThrow(ErrorDeValidacion)
    await expect(crearDeseo({ ...deseo, precio: '0' }, i.id)).rejects.toThrow(ErrorDeValidacion)
    expect(await listarIdeas()).toHaveLength(1)
    expect(await listarPlanes()).toEqual([])
    expect(await listarDeseos()).toEqual([])
  })
  it('borrar la idea y luego convertirla (pantalla abierta con ?idea=)', async () => {
    const i = await crearIdea('Llamar')
    await borrarIdea(i.id)
    await crearTarea({ texto: 'Llamar' }, i.id)
    expect(await listarTareas()).toHaveLength(1)
  })
})

describe('planes: transiciones raras', () => {
  it('idea → hecho sin fecha: se pone la de hoy; deshacer lo deja planeado con esa fecha', async () => {
    const p = await crearPlan(plan)
    const h = await marcarHecho(p.id, 4, ' genial ', '2026-11-14')
    expect(h).toMatchObject({ estado: 'hecho', fecha: '2026-11-14', valoracion: 4, comentario: 'genial' })
    cumpleRestricciones(h)
    const d = await deshacerHecho(p.id)
    expect(d).toMatchObject({ estado: 'planeado', fecha: '2026-11-14', valoracion: null, comentario: '' })
    cumpleRestricciones(d)
  })
  it('hecho conserva su fecha si ya la tenía (aunque sea futura)', async () => {
    const p = await crearPlan({ ...plan, fecha: '2027-01-01' })
    expect((await marcarHecho(p.id, null, '', '2026-11-14')).fecha).toBe('2027-01-01')
  })
  it('marcar hecho dos veces cambia la valoración; una valoración mala no toca nada', async () => {
    const p = await crearPlan({ ...plan, fecha: '2026-11-01' })
    await marcarHecho(p.id, 2, 'meh', '2026-11-14')
    expect(await marcarHecho(p.id, '5', '', '2026-11-14')).toMatchObject({ valoracion: 5, comentario: '' })
    await expect(marcarHecho(p.id, 6, '', '2026-11-14')).rejects.toThrow(ErrorDeValidacion)
    await expect(marcarHecho(p.id, 3, 'x'.repeat(501), '2026-11-14')).rejects.toThrow(ErrorDeValidacion)
    expect((await listarPlanes())[0]).toMatchObject({ estado: 'hecho', valoracion: 5 })
  })
  it('editar un hecho (quitarle la fecha o ponerle otra) no lo saca de hecho y conserva la valoración', async () => {
    const p = await crearPlan({ ...plan, fecha: '2026-11-01' })
    await marcarHecho(p.id, 3, 'bien', '2026-11-14')
    const sinFecha = await editarPlan(p.id, { ...plan, fecha: '' })
    expect(sinFecha).toMatchObject({ estado: 'hecho', fecha: null, valoracion: 3 })
    cumpleRestricciones(sinFecha)
    // Deshacer un hecho sin fecha vuelve a idea
    const d = await deshacerHecho(p.id)
    expect(d).toMatchObject({ estado: 'idea', valoracion: null })
    cumpleRestricciones(d)
  })
  it('deshacer algo que no está hecho no rompe nada', async () => {
    const p = await crearPlan(plan)
    const d = await deshacerHecho(p.id)
    expect(d.estado).toBe('idea')
    cumpleRestricciones(d)
  })
  it('un plan borrado: marcar, deshacer y editar avisan de que ya no existe', async () => {
    const p = await crearPlan(plan)
    await borrarPlan(p.id)
    await expect(marcarHecho(p.id, null, '', '2026-11-14')).rejects.toThrow(ErrorNoEncontrado)
    await expect(deshacerHecho(p.id)).rejects.toThrow(ErrorNoEncontrado)
    await expect(editarPlan(p.id, plan)).rejects.toThrow(ErrorNoEncontrado)
  })
  it('ningún camino deja un plan que el servidor rechazaría', async () => {
    const p = await crearPlan({ ...plan, fecha: '2020-01-01' }) // fecha pasada
    expect(p.estado).toBe('planeado')
    const pasos = [
      () => editarPlan(p.id, plan),
      () => marcarHecho(p.id, 1, '', '2026-11-14'),
      () => editarPlan(p.id, { ...plan, fecha: '' }),
      () => deshacerHecho(p.id),
      () => editarPlan(p.id, { ...plan, fecha: '2026-12-24' }),
      () => deshacerHecho(p.id),
      () => marcarHecho(p.id, null, '', '2026-11-14'),
      () => deshacerHecho(p.id),
    ]
    for (const paso of pasos) cumpleRestricciones(await paso())
  })
})

describe('deseos: comprar, devolver y ahorro', () => {
  it('comprar dos veces (dos pestañas) solo apunta un gasto y no cambia la fecha de compra', async () => {
    const d = await crearDeseo(deseo)
    await marcarComprado(d.id, true, '2026-11-14')
    expect(await marcarComprado(d.id, true, '2026-11-20')).toMatchObject({ comprado_en: '2026-11-14' })
    expect(await listarMovimientos()).toHaveLength(1)
  })
  it('devolver y volver a comprar con gasto apunta un segundo gasto (el primero se queda)', async () => {
    const d = await crearDeseo(deseo)
    await marcarComprado(d.id, true, '2026-11-14')
    await devolverALista(d.id)
    expect((await listarDeseos())[0]).toMatchObject({ comprado: false, comprado_en: null })
    await marcarComprado(d.id, true, '2026-11-15')
    expect((await listarMovimientos()).map((m) => m.fecha).sort()).toEqual(['2026-11-14', '2026-11-15'])
  })
  it('comprar uno que ya no existe no apunta ningún gasto', async () => {
    const d = await crearDeseo(deseo)
    await borrarDeseo(d.id)
    await expect(marcarComprado(d.id, true, '2026-11-14')).rejects.toThrow(ErrorNoEncontrado)
    expect(await listarMovimientos()).toEqual([])
    expect(await cola()).toEqual(['delete deseos'])
  })
  it('precio enorme y artículo largo: el gasto vale para el servidor (importe exacto, concepto ≤ 120)', async () => {
    const d = await crearDeseo({ ...deseo, articulo: 'á'.repeat(120), precio: '999.999.999,99' })
    await marcarComprado(d.id, true, '2026-11-14')
    const [m] = await listarMovimientos()
    expect(m.importe_centimos).toBe(99_999_999_999)
    expect(m.concepto.length).toBeLessThanOrEqual(120)
  })
  it('comprar con gasto baja el ahorro total y el reparto lo nota', async () => {
    await crearMovimiento({ tipo: 'ingreso', concepto: 'Paga', importe: '100', fecha: '2026-11-01' })
    const caro = await crearDeseo({ ...deseo, articulo: 'Caro', precio: '80', prioridad: 'alta' })
    await crearDeseo({ ...deseo, articulo: 'Barato', precio: '30', prioridad: 'media' })
    let ahorro = resumir(await listarMovimientos()).ahorro
    expect(repartirAhorro(await listarDeseos(), ahorro).map((x) => [x.deseo.articulo, x.falta])).toEqual([
      ['Caro', 0],
      ['Barato', 1000],
    ])
    await marcarComprado(caro.id, true, '2026-11-14')
    ahorro = resumir(await listarMovimientos()).ahorro
    expect(ahorro).toBe(2000)
    expect(repartirAhorro(await listarDeseos(), ahorro).map((x) => [x.deseo.articulo, x.falta])).toEqual([['Barato', 1000]])
  })
})
