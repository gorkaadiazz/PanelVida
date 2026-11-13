// Repositorios de dinero, negocio y meta de ahorro sobre un IndexedDB de
// mentira: lo que queda en la copia local y en la cola.

import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorDeValidacion } from '../lib/validacion'
import { abrirBase, usarBase, type BaseLocal } from '../sync/bd'
import { listarPendientes } from '../sync/cola'
import { ErrorNoEncontrado } from './base'
import { borrarCliente, crearCliente, editarCliente, listarClientes, moverCliente } from './clientes'
import { borrarMovimiento, crearMovimiento, editarMovimiento, listarMovimientos } from './movimientos'
import { guardarMetaAhorro, obtenerPerfil } from './perfil'

let base: BaseLocal
const cola = async () => (await listarPendientes(base)).map((e) => `${e.op} ${e.tabla}`).sort()

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

describe('movimientos', () => {
  it('crear guarda el importe en céntimos enteros y lo apunta en la cola', async () => {
    const m = await crearMovimiento({ tipo: 'gasto', concepto: '  Cine ', importe: '8,90', fecha: '2026-11-13' })
    expect(m).toMatchObject({ tipo: 'gasto', concepto: 'Cine', importe_centimos: 890, fecha: '2026-11-13' })
    expect(Number.isInteger(m.importe_centimos)).toBe(true)
    expect(await cola()).toEqual(['upsert movimientos'])
  })

  it('no guarda nada si algún dato no vale', async () => {
    await expect(crearMovimiento({ tipo: 'gasto', concepto: 'Cine', importe: 'ocho', fecha: '2026-11-13' })).rejects.toThrow(ErrorDeValidacion)
    await expect(crearMovimiento({ tipo: 'regalo', concepto: 'Cine', importe: '8', fecha: '2026-11-13' })).rejects.toThrow(ErrorDeValidacion)
    await expect(crearMovimiento({ tipo: 'gasto', concepto: '', importe: '8', fecha: '2026-11-13' })).rejects.toThrow(ErrorDeValidacion)
    await expect(crearMovimiento({ tipo: 'gasto', concepto: 'Cine', importe: '8', fecha: '13/11/2026' })).rejects.toThrow(ErrorDeValidacion)
    expect(await listarMovimientos()).toEqual([])
    expect(await cola()).toEqual([])
  })

  it('editar y borrar', async () => {
    const m = await crearMovimiento({ tipo: 'gasto', concepto: 'Cine', importe: '8', fecha: '2026-11-13' })
    const editado = await editarMovimiento(m.id, { tipo: 'ingreso', concepto: 'Venta', importe: '20,5', fecha: '2026-11-14' })
    expect(editado).toMatchObject({ tipo: 'ingreso', concepto: 'Venta', importe_centimos: 2050, fecha: '2026-11-14' })
    await borrarMovimiento(m.id)
    expect(await listarMovimientos()).toEqual([])
    expect(await cola()).toEqual(['delete movimientos'])
    await expect(editarMovimiento(m.id, { tipo: 'gasto', concepto: 'x', importe: '1', fecha: '2026-11-13' })).rejects.toThrow(ErrorNoEncontrado)
  })
})

describe('clientes', () => {
  it('crear: en Contacto por defecto, al final, y el precio vacío vale 0', async () => {
    const a = await crearCliente({ nombre: 'Bar Pepe', precio: '350', notas: '' })
    const b = await crearCliente({ nombre: 'Peluquería', precio: '', notas: ' Quiere reservas ' })
    expect(a).toMatchObject({ estado: 'contacto', orden: 0, precio_centimos: 35000 })
    expect(b).toMatchObject({ estado: 'contacto', orden: 1, precio_centimos: 0, notas: 'Quiere reservas' })
  })

  it('mover a otro estado lo pone al final de ese estado', async () => {
    const a = await crearCliente({ nombre: 'A', precio: '100', notas: '' }, 'en_curso')
    const b = await crearCliente({ nombre: 'B', precio: '200', notas: '' })
    const movido = await moverCliente(b.id, 'en_curso')
    expect(movido).toMatchObject({ estado: 'en_curso', orden: a.orden + 1 })
    await expect(moverCliente(b.id, 'cobrado' as never)).rejects.toThrow(ErrorDeValidacion)
  })

  it('editar valida y borrar quita', async () => {
    const a = await crearCliente({ nombre: 'A', precio: '100', notas: '' })
    await expect(editarCliente(a.id, { nombre: ' ', precio: '1', notas: '' })).rejects.toThrow(ErrorDeValidacion)
    expect(await editarCliente(a.id, { nombre: 'A2', precio: '150,5', notas: 'n' })).toMatchObject({ nombre: 'A2', precio_centimos: 15050 })
    await borrarCliente(a.id)
    expect(await listarClientes()).toEqual([])
  })
})

describe('meta de ahorro (perfil compartido con la web de exámenes)', () => {
  it('sin perfil descargado no se puede guardar', async () => {
    expect(await obtenerPerfil()).toBeNull()
    await expect(guardarMetaAhorro('1000')).rejects.toThrow(ErrorNoEncontrado)
    expect(await cola()).toEqual([])
  })

  it('cambia solo la meta del perfil descargado y la apunta para subir', async () => {
    // Así llega del servidor: solo las columnas que usa Mi Panel
    await base.tx(['perfiles'], 'readwrite', (t) => {
      t.objectStore('perfiles').put({
        id: 'usuario-1',
        created_at: '2026-09-01T10:00:00Z',
        updated_at: '2026-11-01T10:00:00Z',
        meta_ahorro_centimos: null,
      })
    })
    const p = await guardarMetaAhorro('1.500')
    expect(p.meta_ahorro_centimos).toBe(150000)
    expect(Date.parse(p.updated_at)).toBeGreaterThan(Date.parse('2026-11-01T10:00:00Z'))
    expect(await cola()).toEqual(['upsert perfiles'])
    expect((await guardarMetaAhorro('')).meta_ahorro_centimos).toBeNull()
    await expect(guardarMetaAhorro('-3')).rejects.toThrow(ErrorDeValidacion)
  })
})
