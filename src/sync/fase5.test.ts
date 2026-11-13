// Flujos de la fase 5 (Dinero y Negocio) de punta a punta: repositorios +
// motor + IndexedDB de mentira (fake-indexeddb) + servidor falso.

import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resumenMes, resumir } from '../lib/dinero'
import { clientesDe, resumenNegocio } from '../lib/negocio'
import { borrarCliente, crearCliente, listarClientes, moverCliente } from '../repos/clientes'
import { crearMovimiento, editarMovimiento, listarMovimientos } from '../repos/movimientos'
import { guardarMetaAhorro, obtenerPerfil } from '../repos/perfil'
import { crearTarea, listarTareas } from '../repos/tareas'
import { estadoSync, reiniciarEstado } from './avisos'
import { abrirBase, usarBase, type BaseLocal } from './bd'
import { contarPendientes, listarPendientes } from './cola'
import { crearMotor, type Motor } from './motor'
import { crearServidorFalso, type ServidorFalso } from './servidorFalso'

const PERFIL = 'usuario-1'
const SIN_MIGRACION = { code: 'PGRST204', message: "Could not find the 'importe_centimos' column of 'movimientos' in the schema cache" }

let abiertas: BaseLocal[] = []

interface Dispositivo {
  base: BaseLocal
  red: { conectada: boolean }
  motor: Motor
  /** Hace que los repositorios escriban en este dispositivo. */
  usar(): void
}

async function dispositivo(servidor: ServidorFalso): Promise<Dispositivo> {
  vi.stubGlobal('indexedDB', new IDBFactory()) // cada dispositivo, su IndexedDB
  const base = await abrirBase('usuario-1')
  abiertas.push(base)
  const red = { conectada: true }
  const d = { base, red, motor: crearMotor({ base, remoto: servidor, enLinea: () => red.conectada }), usar: () => usarBase(Promise.resolve(base)) }
  d.usar()
  return d
}

/** Sincroniza con el dispositivo activo para los repositorios. */
async function sincronizar(d: Dispositivo) {
  d.usar()
  return d.motor.sincronizar()
}

const hora = (iso: string) => vi.setSystemTime(new Date(iso))

beforeEach(() => {
  reiniciarEstado()
  vi.useFakeTimers({ toFake: ['Date'] })
  hora('2026-11-13T10:00:00.000Z')
})

afterEach(() => {
  for (const base of abiertas) base.cerrar()
  abiertas = []
  usarBase(null)
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('movimientos', () => {
  it('creado sin conexión: se ve al momento en la copia local y sube al volver la red', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    await sincronizar(pc)

    pc.red.conectada = false
    const m = await crearMovimiento({ tipo: 'gasto', concepto: 'Cine', importe: '8,90', fecha: '2026-11-13' })
    await crearMovimiento({ tipo: 'ingreso', concepto: 'Paga', importe: '20', fecha: '2026-11-01' })
    expect(await sincronizar(pc)).toBe(false)
    expect(estadoSync()).toMatchObject({ fase: 'sin-conexion', pendientes: 2 })
    expect(resumenMes(await listarMovimientos(), '2026-11')).toEqual({ ingresos: 2000, gastos: 890, ahorro: 1110 })
    expect(servidor.filas('movimientos')).toEqual([])

    pc.red.conectada = true
    expect(await sincronizar(pc)).toBe(true)
    expect(await contarPendientes(pc.base)).toBe(0)
    expect(servidor.fila('movimientos', m.id)).toMatchObject({ tipo: 'gasto', concepto: 'Cine', importe_centimos: 890, fecha: '2026-11-13' })
    expect(Number.isInteger(servidor.fila('movimientos', m.id)?.importe_centimos)).toBe(true)

    // Y llega a otro dispositivo
    const movil = await dispositivo(servidor)
    await sincronizar(movil)
    expect(resumenMes(await listarMovimientos(), '2026-11').ahorro).toBe(1110)
  })

  it('editado a otro mes: sale del resumen del mes viejo y entra en el nuevo, aquí, en el servidor y en otro dispositivo', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    const movil = await dispositivo(servidor)
    pc.usar()
    const m = await crearMovimiento({ tipo: 'gasto', concepto: 'Regalo', importe: '30', fecha: '2026-12-01' })
    await sincronizar(pc)
    await sincronizar(movil)
    expect(resumenMes(await listarMovimientos(), '2026-12').gastos).toBe(3000)

    // Cruza el año hacia atrás: del 1/12 al 30/11
    pc.usar()
    hora('2026-11-13T10:05:00.000Z')
    await editarMovimiento(m.id, { tipo: 'gasto', concepto: 'Regalo', importe: '30', fecha: '2026-11-30' })
    const local = await listarMovimientos()
    expect(resumenMes(local, '2026-12').gastos).toBe(0)
    expect(resumenMes(local, '2026-11').gastos).toBe(3000)
    expect(resumir(local).ahorro).toBe(-3000) // el total no cambia

    await sincronizar(pc)
    expect(servidor.fila('movimientos', m.id)?.fecha).toBe('2026-11-30')
    expect(servidor.filas('movimientos')).toHaveLength(1) // se actualiza, no se duplica

    await sincronizar(movil)
    const enMovil = await listarMovimientos()
    expect(enMovil).toHaveLength(1)
    expect(resumenMes(enMovil, '2026-12').gastos).toBe(0)
    expect(resumenMes(enMovil, '2026-11').gastos).toBe(3000)
  })
})

describe('clientes: mover de estado en dos dispositivos a la vez', () => {
  async function preparar() {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    const movil = await dispositivo(servidor)
    pc.usar()
    const c = await crearCliente({ nombre: 'Bar Pepe', precio: '350', notas: '' })
    await sincronizar(pc)
    await sincronizar(movil)
    pc.red.conectada = false
    movil.red.conectada = false
    return { servidor, pc, movil, c }
  }

  it.each([
    ['sube primero el cambio antiguo', true],
    ['sube primero el cambio nuevo', false],
  ])('gana el último cambio (%s) y los dos dispositivos acaban igual', async (_nombre, antiguoPrimero) => {
    const { servidor, pc, movil, c } = await preparar()
    pc.usar()
    hora('2026-11-13T11:00:00.000Z')
    await moverCliente(c.id, 'propuesta') // el antiguo
    movil.usar()
    hora('2026-11-13T11:00:05.000Z')
    await moverCliente(c.id, 'en_curso') // el último

    pc.red.conectada = true
    movil.red.conectada = true
    const [primero, segundo] = antiguoPrimero ? [pc, movil] : [movil, pc]
    expect(await sincronizar(primero)).toBe(true)
    expect(await sincronizar(segundo)).toBe(true)
    expect(await sincronizar(primero)).toBe(true)

    expect(servidor.fila('clientes_web', c.id)?.estado).toBe('en_curso')
    for (const d of [pc, movil]) {
      d.usar()
      const lista = await listarClientes()
      expect(lista).toHaveLength(1)
      expect(clientesDe(lista, 'en_curso').map((x) => x.id)).toEqual([c.id])
      expect(resumenNegocio(lista)).toMatchObject({ enCurso: 35000, facturado: 0 })
      expect(await contarPendientes(d.base)).toBe(0)
    }
    expect(estadoSync().rechazados).toBe(0)
  })
})

describe('meta de ahorro: perfil compartido con la web de exámenes', () => {
  // Así está la fila en el servidor; la web de exámenes sube nombre, curso,
  // tema… pero nunca meta_ahorro_centimos (no está en su limpiarFila).
  async function preparar() {
    const servidor = crearServidorFalso()
    servidor.desdeOtroDispositivo('perfiles', {
      id: PERFIL,
      nombre: 'Gorka',
      tema: 'claro',
      meta_ahorro_centimos: null,
      updated_at: '2026-11-13T09:00:00.000Z',
    })
    const pc = await dispositivo(servidor)
    await sincronizar(pc)
    expect(await obtenerPerfil()).toMatchObject({ id: PERFIL, meta_ahorro_centimos: null })
    return { servidor, pc }
  }

  it('cambios en orden (cada uno se sube antes de que llegue el otro): se conservan los dos', async () => {
    const { servidor, pc } = await preparar()
    hora('2026-11-13T10:00:00.000Z')
    await guardarMetaAhorro('1.000')
    await sincronizar(pc)
    servidor.desdeOtroDispositivo('perfiles', { id: PERFIL, nombre: 'Gorka', tema: 'oscuro', updated_at: '2026-11-13T10:01:00.000Z' })
    await sincronizar(pc)

    expect(servidor.fila('perfiles', PERFIL)).toMatchObject({ tema: 'oscuro', meta_ahorro_centimos: 100000 })
    expect((await obtenerPerfil())?.meta_ahorro_centimos).toBe(100000)
  })

  it('la web cambia el tema ANTES (hora) pero lo sube después del cambio de meta: se conservan los dos', async () => {
    // Orden de llegada = orden de hora: cada upsert solo toca sus columnas
    const { servidor, pc } = await preparar()
    servidor.desdeOtroDispositivo('perfiles', { id: PERFIL, nombre: 'Gorka', tema: 'oscuro', updated_at: '2026-11-13T09:30:00.000Z' })
    hora('2026-11-13T10:00:00.000Z')
    await guardarMetaAhorro('1.000')
    await sincronizar(pc)
    expect(servidor.fila('perfiles', PERFIL)).toMatchObject({ tema: 'oscuro', meta_ahorro_centimos: 100000 })
  })

  it('SE PIERDE la meta: Mi Panel la cambia sin conexión y la web de exámenes cambia otra columna más tarde y sube antes', async () => {
    const { servidor, pc } = await preparar()
    pc.red.conectada = false
    hora('2026-11-13T10:00:00.000Z')
    await guardarMetaAhorro('1.000')
    expect((await obtenerPerfil())?.meta_ahorro_centimos).toBe(100000)

    // La web de exámenes (con conexión) cambia el tema a las 10:05
    servidor.desdeOtroDispositivo('perfiles', { id: PERFIL, nombre: 'Gorka', tema: 'oscuro', updated_at: '2026-11-13T10:05:00.000Z' })

    pc.red.conectada = true
    expect(await sincronizar(pc)).toBe(true)
    // El trigger antes_de_guardar ve un updated_at (10:00) más antiguo que el
    // de la fila (10:05) y se queda la fila entera como estaba: la meta no se guarda.
    expect(servidor.fila('perfiles', PERFIL)).toMatchObject({ tema: 'oscuro', meta_ahorro_centimos: null })
    // Y la copia local vuelve a lo del servidor, sin avisar (no cuenta como rechazado)
    expect((await obtenerPerfil())?.meta_ahorro_centimos).toBeNull()
    expect(estadoSync()).toMatchObject({ fase: 'sincronizado', rechazados: 0, pendientes: 0 })
  })

  it('SE PIERDE el cambio de la web: lo hizo antes (hora) sin conexión y lo sube después de la meta', async () => {
    const { servidor, pc } = await preparar()
    hora('2026-11-13T10:05:00.000Z')
    await guardarMetaAhorro('1.000')
    await sincronizar(pc)
    // La web de exámenes estaba sin conexión: cambió el tema a las 10:00 y lo sube ahora
    servidor.desdeOtroDispositivo('perfiles', { id: PERFIL, nombre: 'Gorka', tema: 'oscuro', updated_at: '2026-11-13T10:00:00.000Z' })
    expect(servidor.fila('perfiles', PERFIL)).toMatchObject({ tema: 'claro', meta_ahorro_centimos: 100000 })
  })
})

describe('movimientos falla en el servidor (PGRST204) y las demás tablas siguen', () => {
  it('al subir y al bajar: clientes y tareas van y vienen; los movimientos esperan en la cola y suben cuando se arregla', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    await sincronizar(pc)

    const m = await crearMovimiento({ tipo: 'gasto', concepto: 'Cine', importe: '8,90', fecha: '2026-11-13' })
    const c = await crearCliente({ nombre: 'Bar Pepe', precio: '350', notas: '' })
    await crearTarea({ texto: 'Llamar a Pepe' })
    servidor.desdeOtroDispositivo('clientes_web', { id: '00000000-0000-4000-8000-0000000000d1', nombre: 'Desde el móvil', precio_centimos: 0, notas: '', estado: 'propuesta', orden: 0 })
    servidor.desdeOtroDispositivo('movimientos', { id: '00000000-0000-4000-8000-0000000000d2', tipo: 'ingreso', concepto: 'Del móvil', importe_centimos: 500, fecha: '2026-11-10' })
    servidor.fallo = (p) => (p === 'guardar movimientos x1' || p === 'descargar movimientos' ? SIN_MIGRACION : null)

    expect(await sincronizar(pc)).toBe(false)
    expect(estadoSync()).toMatchObject({ fase: 'error', rechazados: 0, pendientes: 1 })
    // Lo demás ha subido y bajado
    expect(servidor.fila('clientes_web', c.id)?.nombre).toBe('Bar Pepe')
    expect(servidor.filas('tareas')).toHaveLength(1)
    expect((await listarClientes()).map((x) => x.nombre).sort()).toEqual(['Bar Pepe', 'Desde el móvil'])
    expect(await listarTareas()).toHaveLength(1)
    // El movimiento sigue en la copia local y en la cola, no se ha perdido
    expect((await listarPendientes(pc.base)).map((e) => `${e.tabla} ${e.id}`)).toEqual([`movimientos ${m.id}`])
    expect((await listarMovimientos()).map((x) => x.id)).toEqual([m.id])
    expect(servidor.fila('movimientos', m.id)).toBeUndefined()
    expect(await pc.base.leerMeta('tablas_descargadas')).not.toContain('movimientos')
    expect(await pc.base.leerMeta('tablas_descargadas')).toContain('clientes_web')

    // Varias vueltas con el fallo: nada se pierde ni se cuenta como rechazado
    await sincronizar(pc)
    expect(await contarPendientes(pc.base)).toBe(1)
    expect(estadoSync().rechazados).toBe(0)

    // Se aplica la migración
    servidor.fallo = null
    expect(await sincronizar(pc)).toBe(true)
    expect(servidor.fila('movimientos', m.id)).toMatchObject({ importe_centimos: 890 })
    expect((await listarMovimientos()).map((x) => x.concepto).sort()).toEqual(['Cine', 'Del móvil'])
    expect(estadoSync()).toMatchObject({ fase: 'sincronizado', pendientes: 0, rechazados: 0, error: null })
  })
})

describe('borrado de un cliente que el servidor rechaza', () => {
  it('vuelve a la copia local aunque la fila sea más antigua que el margen de descarga', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    const c = await crearCliente({ nombre: 'Bar Pepe', precio: '350', notas: '' })
    await sincronizar(pc)
    // Pasa el tiempo en el servidor (más de MARGEN_DESCARGA_MS = 60 s) con otros cambios
    for (let i = 0; i < 90; i++) {
      servidor.desdeOtroDispositivo('tareas', { id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, texto: `t${i}`, fecha_limite: null, hecha: false, hecha_en: null })
    }
    await sincronizar(pc)

    await borrarCliente(c.id)
    expect(await listarClientes()).toEqual([])
    servidor.fallo = (p) => (p.startsWith('borrar clientes_web') ? { code: '23503', message: 'violates foreign key constraint' } : null)

    await sincronizar(pc)
    expect(estadoSync().rechazados).toBe(1)
    expect(servidor.fila('clientes_web', c.id)).toBeDefined()
    // Sin bajar la tabla entera, la fila (sync_at antiguo) no volvería nunca
    expect((await listarClientes()).map((x) => x.id)).toEqual([c.id])
    expect(await contarPendientes(pc.base)).toBe(0)
  })
})
