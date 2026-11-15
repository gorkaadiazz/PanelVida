// Traspasos (sacar del cajero / ingresar) de punta a punta: motor, IndexedDB
// de mentira (uno por dispositivo) y el servidor falso.

import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reiniciarEstado } from './avisos'
import { abrirBase, usarBase, type BaseLocal } from './bd'
import { contarPendientes } from './cola'
import { borrarTraspaso, crearTraspaso, listarTraspasos } from '../repos/traspasos'
import { ErrorDeValidacion } from '../lib/validacion'
import { crearMotor, type Motor } from './motor'
import { crearServidorFalso, type ServidorFalso } from './servidorFalso'
import { TABLAS } from './tablas'

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
const HOY = '2026-11-14'

beforeEach(() => {
  reiniciarEstado()
  vi.useFakeTimers({ toFake: ['Date'] })
  hora('2026-11-14T10:00:00.000Z')
})

afterEach(() => {
  for (const base of abiertas) base.cerrar()
  abiertas = []
  usarBase(null)
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('traspasos entre tarjeta y efectivo', () => {
  it('la tabla está declarada para sincronizar', () => {
    expect(TABLAS.some((t) => t.nombre === 'traspasos')).toBe(true)
  })

  it('se crea sin conexión, sube, baja al otro dispositivo y se borra en los dos', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    const movil = await dispositivo(servidor)

    pc.usar()
    pc.red.conectada = false
    const t = await crearTraspaso({ sentido: 'sacar', importe: '50', fecha: HOY })
    expect(t).toMatchObject({ sentido: 'sacar', importe_centimos: 5000, fecha: HOY })
    expect(await sincronizar(pc)).toBe(false)
    expect(await contarPendientes(pc.base)).toBe(1)

    pc.red.conectada = true
    expect(await sincronizar(pc)).toBe(true)
    expect(servidor.fila('traspasos', t.id)).toMatchObject({ sentido: 'sacar', importe_centimos: 5000, fecha: HOY })

    expect(await sincronizar(movil)).toBe(true)
    movil.usar()
    expect((await listarTraspasos()).map((x) => x.id)).toEqual([t.id])

    hora('2026-11-14T10:01:00.000Z')
    await borrarTraspaso(t.id)
    expect(await sincronizar(movil)).toBe(true)
    expect(servidor.filas('traspasos')).toEqual([])
    await sincronizar(pc)
    pc.usar()
    expect(await listarTraspasos()).toEqual([])
  })

  it('no se guarda con un sentido, importe o fecha que no valen', async () => {
    const servidor = crearServidorFalso()
    await dispositivo(servidor)
    await expect(crearTraspaso({ sentido: 'bizum', importe: '5', fecha: HOY })).rejects.toThrow(ErrorDeValidacion)
    await expect(crearTraspaso({ sentido: 'sacar', importe: '0', fecha: HOY })).rejects.toThrow(ErrorDeValidacion)
    await expect(crearTraspaso({ sentido: 'ingresar', importe: '5', fecha: '14/11/2026' })).rejects.toThrow(ErrorDeValidacion)
    expect(await listarTraspasos()).toEqual([])
  })

  it('una fecha fuera de 2000-2100 no se guarda en local (el servidor la rechazaría)', async () => {
    const servidor = crearServidorFalso()
    await dispositivo(servidor)
    await expect(crearTraspaso({ sentido: 'sacar', importe: '5', fecha: '0202-11-14' })).rejects.toThrow(ErrorDeValidacion)
    await expect(crearTraspaso({ sentido: 'sacar', importe: '5', fecha: '2101-01-01' })).rejects.toThrow(ErrorDeValidacion)
    expect(await listarTraspasos()).toEqual([])
  })

  it('importe con céntimos y miles al estilo español se guarda en céntimos exactos', async () => {
    const servidor = crearServidorFalso()
    await dispositivo(servidor)
    expect((await crearTraspaso({ sentido: 'ingresar', importe: '1.234,56', fecha: HOY })).importe_centimos).toBe(123456)
    expect((await crearTraspaso({ sentido: 'sacar', importe: '0,1', fecha: HOY })).importe_centimos).toBe(10)
  })

  it('varios traspasos sin conexión suben todos al volver y no tocan movimientos', async () => {
    const servidor = crearServidorFalso()
    const pc = await dispositivo(servidor)
    pc.red.conectada = false
    await crearTraspaso({ sentido: 'sacar', importe: '20', fecha: HOY })
    await crearTraspaso({ sentido: 'ingresar', importe: '5,50', fecha: '2026-10-31' })
    expect(await contarPendientes(pc.base)).toBe(2)
    pc.red.conectada = true
    expect(await sincronizar(pc)).toBe(true)
    expect(await contarPendientes(pc.base)).toBe(0)
    expect(servidor.filas('traspasos')).toHaveLength(2)
    expect(servidor.filas('movimientos')).toEqual([])
  })
})
