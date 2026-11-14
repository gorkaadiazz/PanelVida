// Movimientos fijos y categorías de punta a punta: repositorios + motor +
// IndexedDB de mentira + servidor falso, con dos dispositivos.

import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gastosPorCategoria } from '../lib/dinero'
import { idApunteFijo } from '../lib/fijos'
import { ErrorDeValidacion } from '../lib/validacion'
import { aplicarFijos, borrarFijo, crearFijo, editarFijo, listarFijos, pausarFijo, type DatosFijo } from '../repos/fijos'
import { borrarMovimiento, crearMovimiento, editarMovimiento, listarMovimientos } from '../repos/movimientos'
import { reiniciarEstado } from './avisos'
import { abrirBase, usarBase, type BaseLocal } from './bd'
import { crearMotor, type Motor } from './motor'
import { crearServidorFalso, type ServidorFalso } from './servidorFalso'

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
const gimnasio: DatosFijo = { tipo: 'gasto', concepto: 'Gimnasio', importe: '30,50', dia: '1', categoria: 'salud', frecuencia: 'mensual', mes: '', necesidad: '' }

beforeEach(() => {
  reiniciarEstado()
  vi.useFakeTimers({ toFake: ['Date'] })
  hora('2026-11-01T08:00:00.000Z')
})

afterEach(() => {
  for (const base of abiertas) base.cerrar()
  abiertas = []
  usarBase(null)
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('sincronización de movimientos_fijos y de la categoría', () => {
  it('el fijo y la categoría suben con todas sus columnas y bajan al otro dispositivo', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    const movil = await dispositivo(servidor)
    await sincronizar(pc)
    await sincronizar(movil)

    pc.usar()
    const f = await crearFijo({ ...gimnasio, dia: '20' }, '2026-11-01')
    const m = await crearMovimiento({ tipo: 'gasto', concepto: 'Súper', importe: '12,34', fecha: '2026-11-01', categoria: 'comida' })
    await sincronizar(pc)
    expect(servidor.fila('movimientos_fijos', f.id)).toMatchObject({
      tipo: 'gasto', concepto: 'Gimnasio', importe_centimos: 3050, categoria: 'salud', dia: 20, desde: '2026-11', ultimo_mes: null, activo: true,
    })
    expect(servidor.fila('movimientos', m.id)).toMatchObject({ categoria: 'comida', importe_centimos: 1234 })

    await sincronizar(movil)
    expect(await listarFijos()).toMatchObject([{ id: f.id, dia: 20, categoria: 'salud', activo: true }])
    expect((await listarMovimientos())[0]).toMatchObject({ id: m.id, categoria: 'comida' })
  })

  it('editar un gasto a ingreso deja la categoría a null también en el servidor y en el otro dispositivo', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    const movil = await dispositivo(servidor)
    await sincronizar(pc)
    pc.usar()
    const m = await crearMovimiento({ tipo: 'gasto', concepto: 'Venta', importe: '20', fecha: '2026-11-01', categoria: 'compras' })
    await sincronizar(pc)
    hora('2026-11-01T09:00:00.000Z')
    pc.usar()
    await editarMovimiento(m.id, { tipo: 'ingreso', concepto: 'Venta', importe: '20', fecha: '2026-11-01', categoria: 'compras' })
    await sincronizar(pc)
    expect(servidor.fila('movimientos', m.id)).toMatchObject({ tipo: 'ingreso', categoria: null })
    await sincronizar(movil)
    expect((await listarMovimientos())[0]).toMatchObject({ tipo: 'ingreso', categoria: null })

    // Y de vuelta a gasto: sin categoría hasta que se elija
    hora('2026-11-01T10:00:00.000Z')
    pc.usar()
    await editarMovimiento(m.id, { tipo: 'gasto', concepto: 'Venta', importe: '20', fecha: '2026-11-01', categoria: '' })
    await sincronizar(pc)
    expect(servidor.fila('movimientos', m.id)).toMatchObject({ tipo: 'gasto', categoria: null })
  })

  it('una categoría desconocida bajada del servidor: se guarda tal cual, cuenta como «sin categoría» y no deja guardarla al editar', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    await sincronizar(pc)
    const id = '7d444840-9dc0-41a1-ae5c-0d6b7d1f1c2a'
    servidor.desdeOtroDispositivo('movimientos', { id, tipo: 'gasto', concepto: 'Pienso', importe_centimos: 1500, fecha: '2026-11-01', categoria: 'mascotas' })
    await sincronizar(pc)
    const movs = await listarMovimientos()
    expect(movs).toMatchObject([{ id, categoria: 'mascotas' }])
    expect(gastosPorCategoria(movs, '2026-11')).toEqual([{ categoria: null, nombre: 'Sin categoría', total: 1500, porcentaje: 100 }])
    // El formulario de edición arranca con m.categoria: si no se cambia, el repositorio lo rechaza
    await expect(editarMovimiento(id, { tipo: 'gasto', concepto: 'Pienso', importe: '15', fecha: '2026-11-01', categoria: 'mascotas' })).rejects.toThrow(
      ErrorDeValidacion,
    )
  })
})

describe('apunte de fijos con dos dispositivos', () => {
  it('los dos con conexión: el segundo baja el apunte y `ultimo_mes` y no lo repite', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    const movil = await dispositivo(servidor)
    await sincronizar(pc)
    pc.usar()
    const f = await crearFijo(gimnasio, '2026-11-01')
    expect(await aplicarFijos('2026-11-01')).toBe(1)
    await sincronizar(pc)

    await sincronizar(movil)
    expect(await aplicarFijos('2026-11-01')).toBe(0)
    await sincronizar(movil)
    expect(servidor.filas('movimientos')).toHaveLength(1)
    expect(servidor.fila('movimientos', idApunteFijo(f.id, '2026-11'))).toMatchObject({ importe_centimos: 3050, categoria: 'salud', fecha: '2026-11-01' })
    expect(servidor.fila('movimientos_fijos', f.id)?.ultimo_mes).toBe('2026-11')
  })

  it('los dos SIN conexión apuntan el mismo mes: al sincronizar queda una sola fila en el servidor y en cada uno', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    const movil = await dispositivo(servidor)
    await sincronizar(pc)
    pc.usar()
    const f = await crearFijo({ ...gimnasio, dia: '31' }, '2026-11-01')
    await sincronizar(pc)
    await sincronizar(movil)

    pc.red.conectada = false
    movil.red.conectada = false
    hora('2026-11-30T08:00:00.000Z')
    pc.usar()
    expect(await aplicarFijos('2026-11-30')).toBe(1)
    hora('2026-11-30T09:00:00.000Z')
    movil.usar()
    expect(await aplicarFijos('2026-11-30')).toBe(1)

    pc.red.conectada = true
    movil.red.conectada = true
    expect(await sincronizar(pc)).toBe(true)
    expect(await sincronizar(movil)).toBe(true)
    expect(await sincronizar(pc)).toBe(true)
    expect(servidor.filas('movimientos').map((m) => m.id)).toEqual([idApunteFijo(f.id, '2026-11')])
    expect(servidor.fila('movimientos', idApunteFijo(f.id, '2026-11'))?.fecha).toBe('2026-11-30')
    pc.usar()
    expect(await listarMovimientos()).toHaveLength(1)
    movil.usar()
    expect(await listarMovimientos()).toHaveLength(1)
    expect(await aplicarFijos('2026-11-30')).toBe(0)
  })

  it('un apunte borrado en un dispositivo no reaparece tras sincronizar (el otro estaba al día)', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    const movil = await dispositivo(servidor)
    await sincronizar(pc)
    pc.usar()
    const f = await crearFijo(gimnasio, '2026-11-01')
    await aplicarFijos('2026-11-01')
    await sincronizar(pc)
    await sincronizar(movil)

    hora('2026-11-01T09:00:00.000Z')
    pc.usar()
    await borrarMovimiento(idApunteFijo(f.id, '2026-11'))
    await sincronizar(pc)

    hora('2026-11-02T09:00:00.000Z')
    await sincronizar(movil)
    expect(await aplicarFijos('2026-11-02')).toBe(0)
    await sincronizar(movil)
    await sincronizar(pc)
    expect(servidor.filas('movimientos')).toEqual([])
    pc.usar()
    expect(await listarMovimientos()).toEqual([])
    movil.usar()
    expect(await listarMovimientos()).toEqual([])
  })

  it('un apunte borrado en un dispositivo no reaparece aunque el otro lo apunte SIN conexión y luego suba', async () => {
    // El móvil bajó el fijo antes del día 1 y luego se quedó sin conexión.
    // El PC lo apunta el día 1, el usuario lo borra (este mes no ha ido al
    // gimnasio). El móvil, sin conexión, lo apunta (ApuntarFijos no espera a
    // sincronizar si no hay red) y al volver la red lo sube.
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    const movil = await dispositivo(servidor)
    await sincronizar(pc)
    hora('2026-10-31T08:00:00.000Z')
    pc.usar()
    const f = await crearFijo(gimnasio, '2026-10-31')
    await sincronizar(pc)
    await sincronizar(movil)
    movil.red.conectada = false

    hora('2026-11-01T08:00:00.000Z')
    pc.usar()
    await aplicarFijos('2026-11-01')
    await sincronizar(pc)
    hora('2026-11-01T09:00:00.000Z')
    pc.usar()
    await borrarMovimiento(idApunteFijo(f.id, '2026-11'))
    await sincronizar(pc)

    hora('2026-11-01T10:00:00.000Z')
    movil.usar()
    expect(await aplicarFijos('2026-11-01')).toBe(1)
    movil.red.conectada = true
    await sincronizar(movil)
    await sincronizar(pc)

    expect(servidor.filas('movimientos')).toEqual([])
    pc.usar()
    expect(await listarMovimientos()).toEqual([])
    movil.usar()
    expect(await listarMovimientos()).toEqual([])
  })

  it('pausar en un dispositivo detiene el apunte en el otro tras sincronizar', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    const movil = await dispositivo(servidor)
    await sincronizar(pc)
    pc.usar()
    const f = await crearFijo({ ...gimnasio, dia: '5' }, '2026-11-01')
    await sincronizar(pc)
    await sincronizar(movil)
    hora('2026-11-02T08:00:00.000Z')
    pc.usar()
    await pausarFijo(f.id, true, '2026-11-02')
    await sincronizar(pc)
    hora('2026-11-05T08:00:00.000Z')
    await sincronizar(movil)
    expect(await aplicarFijos('2026-11-05')).toBe(0)
  })

  it('borrar el fijo en un dispositivo: el otro no apunta más (y lo ya apuntado se queda)', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    const movil = await dispositivo(servidor)
    await sincronizar(pc)
    pc.usar()
    const f = await crearFijo(gimnasio, '2026-11-01')
    await aplicarFijos('2026-11-01')
    await sincronizar(pc)
    await sincronizar(movil)
    hora('2026-11-10T08:00:00.000Z')
    pc.usar()
    await borrarFijo(f.id)
    await sincronizar(pc)
    hora('2026-12-01T08:00:00.000Z')
    await sincronizar(movil)
    expect(await listarFijos()).toEqual([])
    expect(await aplicarFijos('2026-12-01')).toBe(0)
    expect(servidor.filas('movimientos')).toHaveLength(1)
  })
})

describe('fijos: casos límite del repositorio', () => {
  it('fijo del 29, 30 y 31: febrero bisiesto y no bisiesto, y paso de año', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    await sincronizar(pc)
    pc.usar()
    await crearFijo({ ...gimnasio, concepto: 'D29', dia: '29' }, '2027-12-01')
    await crearFijo({ ...gimnasio, concepto: 'D30', dia: '30' }, '2027-12-01')
    await crearFijo({ ...gimnasio, concepto: 'D31', dia: '31' }, '2027-12-01')
    // Diciembre y enero de los tres; en febrero bisiesto los tres caen el 29
    expect(await aplicarFijos('2028-02-28')).toBe(6)
    expect(await aplicarFijos('2028-02-29')).toBe(3)
    const fechas = async () => (await listarMovimientos()).map((m) => `${m.concepto} ${m.fecha}`).sort()
    expect(await fechas()).toEqual([
      'D29 2027-12-29', 'D29 2028-01-29', 'D29 2028-02-29',
      'D30 2027-12-30', 'D30 2028-01-30', 'D30 2028-02-29',
      'D31 2027-12-31', 'D31 2028-01-31', 'D31 2028-02-29',
    ])
    // Febrero no bisiesto (2029): los tres el 28, y nada el 27
    expect(await aplicarFijos('2029-01-31')).toBe(3 * 11) // mar-2028 … ene-2029
    expect(await aplicarFijos('2029-02-27')).toBe(0)
    expect(await aplicarFijos('2029-02-28')).toBe(3)
    expect((await fechas()).filter((x) => x.includes('2029-02'))).toEqual(['D29 2029-02-28', 'D30 2029-02-28', 'D31 2029-02-28'])
  })

  it('cambiar el día de un fijo no apunta dos veces el mismo mes', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    await sincronizar(pc)
    pc.usar()
    const f = await crearFijo({ ...gimnasio, dia: '5' }, '2026-11-01')
    expect(await aplicarFijos('2026-11-05')).toBe(1)
    await editarFijo(f.id, { ...gimnasio, dia: '20' }, '2026-11-01')
    expect(await aplicarFijos('2026-11-20')).toBe(0)
    expect(await aplicarFijos('2026-12-19')).toBe(0)
    expect(await aplicarFijos('2026-12-20')).toBe(1)
    expect((await listarMovimientos()).map((m) => m.fecha).sort()).toEqual(['2026-11-05', '2026-12-20'])
  })

  it('adelantar el día a uno que ya pasó este mes: lo apunta este mes (con la nueva fecha) una sola vez', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    await sincronizar(pc)
    pc.usar()
    const f = await crearFijo({ ...gimnasio, dia: '20' }, '2026-11-01')
    await editarFijo(f.id, { ...gimnasio, dia: '5' }, '2026-11-01')
    expect(await aplicarFijos('2026-11-10')).toBe(1)
    expect(await aplicarFijos('2026-11-25')).toBe(0)
    expect((await listarMovimientos()).map((m) => m.fecha)).toEqual(['2026-11-05'])
  })

  it('pausar y reanudar el mismo mes antes de su día: ese mes sí se apunta', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    await sincronizar(pc)
    pc.usar()
    const f = await crearFijo({ ...gimnasio, dia: '15' }, '2026-11-01')
    await pausarFijo(f.id, true, '2026-11-02')
    await pausarFijo(f.id, false, '2026-11-03')
    expect(await aplicarFijos('2026-11-15')).toBe(1)
  })

  it('reanudar el mismo día que toca: se apunta hoy', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    await sincronizar(pc)
    pc.usar()
    const f = await crearFijo({ ...gimnasio, dia: '15' }, '2026-10-01')
    await aplicarFijos('2026-10-15')
    await pausarFijo(f.id, true, '2026-10-20')
    await pausarFijo(f.id, false, '2027-01-15')
    expect(await aplicarFijos('2027-01-15')).toBe(1)
    expect((await listarMovimientos()).map((m) => m.fecha).sort()).toEqual(['2026-10-15', '2027-01-15'])
  })

  it('reanudar sin haber apuntado nunca y con `desde` pasado: no recupera los meses en pausa', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    await sincronizar(pc)
    pc.usar()
    const f = await crearFijo({ ...gimnasio, dia: '10' }, '2026-11-01')
    await pausarFijo(f.id, true, '2026-11-02')
    await pausarFijo(f.id, false, '2027-03-20')
    expect(await aplicarFijos('2027-03-20')).toBe(0)
    expect(await aplicarFijos('2027-04-10')).toBe(1)
  })
})

describe('remoto', () => {
  it('movimientos_fijos se baja entera (es tabla propia)', async () => {
    const { columnasDeDescarga } = await import('./tablas')
    expect(columnasDeDescarga('movimientos_fijos')).toBe('*')
  })
})
