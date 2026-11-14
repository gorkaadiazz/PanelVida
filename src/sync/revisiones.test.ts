// Fijos con frecuencia y revisiones de ahorro de punta a punta: repositorios +
// motor + IndexedDB de mentira + servidor falso, con dos dispositivos.
// El lunes 16/11/2026 se revisa la semana del 9 al 15.

import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { idApunteFijo } from '../lib/fijos'
import { leerDatosRevision } from '../lib/revision'
import { ErrorDeValidacion } from '../lib/validacion'
import { aplicarFijos, crearFijo, editarFijo, listarFijos, pausarFijo, type DatosFijo } from '../repos/fijos'
import { crearMovimiento, editarMovimiento, listarMovimientos } from '../repos/movimientos'
import { faltaRevision, generarRevisiones, listarRevisiones, marcarVista } from '../repos/revisiones'
import { reiniciarEstado } from './avisos'
import { abrirBase, usarBase, type BaseLocal } from './bd'
import { crearMotor, type Motor } from './motor'
import { crearServidorFalso, type ServidorFalso } from './servidorFalso'

const PERFIL = 'aaaaaaaa-0000-4000-8000-000000000001'
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

function servidorConPerfil(meta: number | null = null) {
  const servidor = crearServidorFalso()
  servidor.desdeOtroDispositivo('perfiles', { id: PERFIL, meta_ahorro_centimos: meta, updated_at: '2026-11-01T00:00:00.000Z' })
  return servidor
}

const hora = (iso: string) => vi.setSystemTime(new Date(iso))
const base: DatosFijo = { tipo: 'gasto', concepto: 'Clase', importe: '20', frecuencia: 'semanal', dia: '3', mes: '', categoria: 'estudios', necesidad: 'esencial' }

beforeEach(() => {
  reiniciarEstado()
  vi.useFakeTimers({ toFake: ['Date'] })
  hora('2026-11-09T08:00:00.000Z')
})

afterEach(() => {
  for (const b of abiertas) b.cerrar()
  abiertas = []
  usarBase(null)
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('fijos con frecuencia', () => {
  it('semanal: se apunta cada miércoles con su categoría, necesidad y fijo_id, y sube todo', async () => {
    const servidor = servidorConPerfil()
    const pc = await dispositivo(servidor)
    await sincronizar(pc)
    pc.usar()
    const f = await crearFijo(base, '2026-11-09')
    expect(f).toMatchObject({ frecuencia: 'semanal', dia: 3, mes: null, inicio: '2026-11-09', ultimo_apunte: null, desde: '9999-12', ultimo_mes: null })
    expect(await aplicarFijos('2026-11-18')).toBe(2)
    await sincronizar(pc)
    expect(servidor.filas('movimientos').map((m) => m.fecha).sort()).toEqual(['2026-11-11', '2026-11-18'])
    expect(servidor.fila('movimientos', idApunteFijo(f.id, '2026-11-09', 'semanal'))).toMatchObject({
      importe_centimos: 2000,
      categoria: 'estudios',
      necesidad: 'esencial',
      fijo_id: f.id,
    })
    expect(servidor.fila('movimientos_fijos', f.id)).toMatchObject({ frecuencia: 'semanal', ultimo_apunte: '2026-11-18', inicio: '2026-11-09' })
  })

  it('diaria: un apunte el domingo por los días de esa semana, «Café (5 días)»', async () => {
    const servidor = servidorConPerfil()
    const pc = await dispositivo(servidor)
    pc.usar()
    await crearFijo({ ...base, concepto: 'Café', importe: '1,50', frecuencia: 'diaria', dia: '', categoria: 'comida', necesidad: 'prescindible' }, '2026-11-11')
    expect(await aplicarFijos('2026-11-14')).toBe(0)
    expect(await aplicarFijos('2026-11-22')).toBe(2)
    const movs = (await listarMovimientos()).sort((a, b) => a.fecha.localeCompare(b.fecha))
    expect(movs.map((m) => [m.fecha, m.concepto, m.importe_centimos])).toEqual([
      ['2026-11-15', 'Café (5 días)', 750],
      ['2026-11-22', 'Café (7 días)', 1050],
    ])
  })

  it('anual: el 29/2 se apunta el 28 en 2027', async () => {
    const pc = await dispositivo(servidorConPerfil())
    pc.usar()
    await crearFijo({ ...base, concepto: 'Seguro', importe: '120', frecuencia: 'anual', dia: '29', mes: '2' }, '2026-11-09')
    expect(await aplicarFijos('2027-02-27')).toBe(0)
    expect(await aplicarFijos('2027-02-28')).toBe(1)
    expect(await aplicarFijos('2027-12-31')).toBe(0)
    expect((await listarMovimientos())[0]).toMatchObject({ fecha: '2027-02-28', importe_centimos: 12000 })
  })

  it('valida la frecuencia, el día de la semana, el mes y el tope de un diario', async () => {
    await dispositivo(servidorConPerfil())
    await expect(crearFijo({ ...base, frecuencia: 'quincenal' }, '2026-11-09')).rejects.toThrow(ErrorDeValidacion)
    await expect(crearFijo({ ...base, dia: '8' }, '2026-11-09')).rejects.toThrow(ErrorDeValidacion)
    await expect(crearFijo({ ...base, frecuencia: 'anual', dia: '31', mes: '4' }, '2026-11-09')).rejects.toThrow(ErrorDeValidacion)
    await expect(crearFijo({ ...base, frecuencia: 'diaria', importe: '200.000.000' }, '2026-11-09')).rejects.toThrow(ErrorDeValidacion)
    await expect(crearFijo({ ...base, necesidad: 'capricho' }, '2026-11-09')).rejects.toThrow(ErrorDeValidacion)
    expect(await listarFijos()).toEqual([])
  })

  it('un ingreso fijo no lleva necesidad', async () => {
    await dispositivo(servidorConPerfil())
    expect((await crearFijo({ ...base, tipo: 'ingreso', concepto: 'Paga' }, '2026-11-09')).necesidad).toBeNull()
  })

  it('cambiar de semanal a mensual cuenta desde hoy y no recupera nada', async () => {
    await dispositivo(servidorConPerfil())
    const f = await crearFijo(base, '2026-11-09')
    expect(await aplicarFijos('2026-11-11')).toBe(1)
    const editado = await editarFijo(f.id, { ...base, frecuencia: 'mensual', dia: '1' }, '2026-11-12')
    // Lo apuntado con la frecuencia vieja no cuenta para la nueva: empieza de cero desde hoy
    expect(editado).toMatchObject({ frecuencia: 'mensual', inicio: '2026-11-12', ultimo_apunte: null, desde: '2026-12', ultimo_mes: null })
    expect(await aplicarFijos('2026-11-30')).toBe(0)
    expect(await aplicarFijos('2026-12-01')).toBe(1)
  })

  it('pausar y reanudar: no se apunta lo de la pausa', async () => {
    await dispositivo(servidorConPerfil())
    const f = await crearFijo(base, '2026-11-09')
    await pausarFijo(f.id, true, '2026-11-10')
    expect(await aplicarFijos('2026-11-25')).toBe(0)
    await pausarFijo(f.id, false, '2026-11-26')
    expect(await aplicarFijos('2026-12-02')).toBe(1)
    expect((await listarMovimientos()).map((m) => m.fecha)).toEqual(['2026-12-02'])
  })

  it('dos dispositivos SIN conexión apuntan la misma semana: queda una sola fila', async () => {
    const servidor = servidorConPerfil()
    const pc = await dispositivo(servidor)
    const movil = await dispositivo(servidor)
    pc.usar()
    const f = await crearFijo(base, '2026-11-09')
    await sincronizar(pc)
    await sincronizar(movil)
    pc.red.conectada = false
    movil.red.conectada = false
    pc.usar()
    expect(await aplicarFijos('2026-11-11')).toBe(1)
    movil.usar()
    expect(await aplicarFijos('2026-11-11')).toBe(1)
    pc.red.conectada = true
    movil.red.conectada = true
    await sincronizar(pc)
    await sincronizar(movil)
    expect(servidor.filas('movimientos').map((m) => m.id)).toEqual([idApunteFijo(f.id, '2026-11-09', 'semanal')])
  })
})

describe('esencial o prescindible en los movimientos', () => {
  it('se guarda en los gastos, se quita en los ingresos y editar no toca fijo_id', async () => {
    await dispositivo(servidorConPerfil())
    const m = await crearMovimiento({ tipo: 'gasto', concepto: 'Cine', importe: '9', fecha: '2026-11-09', necesidad: 'prescindible' })
    expect(m).toMatchObject({ necesidad: 'prescindible', fijo_id: null })
    const ingreso = await editarMovimiento(m.id, { tipo: 'ingreso', concepto: 'Venta', importe: '9', fecha: '2026-11-09', necesidad: 'prescindible' })
    expect(ingreso.necesidad).toBeNull()
    await expect(crearMovimiento({ tipo: 'gasto', concepto: 'x', importe: '1', fecha: '2026-11-09', necesidad: 'Prescindible' })).rejects.toThrow(ErrorDeValidacion)

    const f = await crearFijo(base, '2026-11-09')
    await aplicarFijos('2026-11-11')
    const apunte = (await listarMovimientos()).find((x) => x.fijo_id === f.id)!
    const editado = await editarMovimiento(apunte.id, { tipo: 'gasto', concepto: 'Clase', importe: '25', fecha: '2026-11-11', necesidad: '' })
    expect(editado).toMatchObject({ fijo_id: f.id, necesidad: null, importe_centimos: 2500 })
  })
})

describe('revisiones', () => {
  async function conMovimientos(meta: number | null = null) {
    const servidor = servidorConPerfil(meta)
    const pc = await dispositivo(servidor)
    await sincronizar(pc)
    pc.usar()
    await crearMovimiento({ tipo: 'gasto', concepto: 'Cine', importe: '9', fecha: '2026-11-10', categoria: 'ocio', necesidad: 'prescindible' })
    await crearMovimiento({ tipo: 'ingreso', concepto: 'Paga', importe: '50', fecha: '2026-10-20' })
    return { servidor, pc }
  }

  it('el lunes se hace la de la semana pasada y el día 1 la del mes pasado, una sola vez', async () => {
    const { servidor, pc } = await conMovimientos(100000)
    expect(await generarRevisiones('2026-11-15')).toBe(1) // domingo: la semana del 2 al 8 no tiene nada; octubre sí
    expect(await generarRevisiones('2026-11-16')).toBe(1) // lunes: la del 9 al 15
    expect(await generarRevisiones('2026-11-16')).toBe(0)
    const revisiones = await listarRevisiones()
    expect(revisiones.map((r) => [r.tipo, r.inicio, r.fin, r.vista])).toEqual([
      ['semanal', '2026-11-09', '2026-11-15', false],
      ['mensual', '2026-10-01', '2026-10-31', false],
    ])
    const datos = leerDatosRevision(revisiones[0].datos)
    expect(datos).toMatchObject({ gastos: 900, prescindibles: 900, meta: 100000, ahorro_total: 4100 })
    expect(datos?.sugerencias[0]).toMatchObject({ regla: 'prescindible', titulo: 'Cine' })

    await sincronizar(pc)
    expect(servidor.filas('revisiones')).toHaveLength(2)
  })

  it('sin perfil (aún no ha bajado) no hace nada; sin movimientos en el periodo, tampoco', async () => {
    const pc = await dispositivo(crearServidorFalso())
    pc.usar()
    await crearMovimiento({ tipo: 'gasto', concepto: 'Cine', importe: '9', fecha: '2026-11-10' })
    expect(await generarRevisiones('2026-11-16')).toBe(0)

    const otro = await dispositivo(servidorConPerfil())
    await sincronizar(otro)
    otro.usar()
    expect(await generarRevisiones('2026-11-16')).toBe(0)
    expect(faltaRevision([], [], '2026-11-16')).toBe(false)
  })

  it('si dos dispositivos hacen la misma revisión, el servidor acepta una y el otro se queda con esa', async () => {
    const { servidor, pc } = await conMovimientos()
    // Como el unique (user_id, tipo, inicio) de la base de datos
    servidor.rechazar = (tabla, fila) =>
      tabla === 'revisiones' && servidor.filas('revisiones').some((r) => r.id !== fila.id && r.tipo === fila.tipo && r.inicio === fila.inicio) ? '23505' : null
    await sincronizar(pc)
    const movil = await dispositivo(servidor)
    await sincronizar(movil)
    pc.usar()
    expect(await generarRevisiones('2026-11-16')).toBe(2)
    movil.usar()
    expect(await generarRevisiones('2026-11-16')).toBe(2)
    expect(await sincronizar(pc)).toBe(true)
    expect(await sincronizar(movil)).toBe(true)
    const buenas = servidor.filas('revisiones').map((r) => r.id).sort()
    expect(buenas).toHaveLength(2)
    movil.usar()
    expect((await listarRevisiones()).map((r) => r.id).sort()).toEqual(buenas)
    expect(await generarRevisiones('2026-11-16')).toBe(0)
  })

  it('el otro dispositivo baja la revisión hecha y no la repite; marcarla vista se sincroniza', async () => {
    const { servidor, pc } = await conMovimientos()
    await generarRevisiones('2026-11-16')
    await sincronizar(pc)
    const movil = await dispositivo(servidor)
    await sincronizar(movil)
    movil.usar()
    const revisiones = await listarRevisiones()
    expect(faltaRevision(revisiones, await listarMovimientos(), '2026-11-16')).toBe(false)
    expect(await generarRevisiones('2026-11-16')).toBe(0)
    await marcarVista(revisiones[0].id)
    await sincronizar(movil)
    expect(servidor.fila('revisiones', revisiones[0].id)?.vista).toBe(true)
  })
})
