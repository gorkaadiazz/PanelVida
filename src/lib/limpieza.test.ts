import { afterEach, describe, expect, it, vi } from 'vitest'
import { limpiarDatosLocales } from './limpieza'

type Peticion = { onsuccess?: () => void; onerror?: () => void; onblocked?: () => void }

/** indexedDB falso: deleteDatabase responde con el evento indicado. */
function indexedDBFalso(nombres: (string | undefined)[], evento: keyof Peticion = 'onsuccess') {
  const deleteDatabase = vi.fn(() => {
    const peticion: Peticion = {}
    queueMicrotask(() => peticion[evento]?.())
    return peticion
  })
  const databases = vi.fn(async () => nombres.map((name) => ({ name, version: 1 })))
  vi.stubGlobal('indexedDB', { databases, deleteDatabase })
  return { databases, deleteDatabase }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('limpiarDatosLocales', () => {
  it('borra solo las bases que empiezan por "mi-panel"', async () => {
    const { deleteDatabase } = indexedDBFalso(['mi-panel', 'mi-panel-sync', 'otra-app', 'firebase-mi-panel', undefined])
    await limpiarDatosLocales()
    expect(deleteDatabase.mock.calls.map((c: unknown[]) => c[0])).toEqual(['mi-panel', 'mi-panel-sync'])
  })

  it('termina aunque el borrado quede bloqueado o falle', async () => {
    indexedDBFalso(['mi-panel'], 'onblocked')
    await expect(limpiarDatosLocales()).resolves.toBeUndefined()
    indexedDBFalso(['mi-panel'], 'onerror')
    await expect(limpiarDatosLocales()).resolves.toBeUndefined()
  })

  it('no lanza si no existe indexedDB', async () => {
    vi.stubGlobal('indexedDB', undefined)
    await expect(limpiarDatosLocales()).resolves.toBeUndefined()
  })

  it('no lanza si no existe indexedDB.databases()', async () => {
    const deleteDatabase = vi.fn()
    vi.stubGlobal('indexedDB', { deleteDatabase })
    await expect(limpiarDatosLocales()).resolves.toBeUndefined()
    expect(deleteDatabase).not.toHaveBeenCalled()
  })

  it('no lanza si databases() falla', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('indexedDB', { databases: vi.fn(async () => Promise.reject(new Error('roto'))), deleteDatabase: vi.fn() })
    await expect(limpiarDatosLocales()).resolves.toBeUndefined()
    expect(error).toHaveBeenCalled()
  })
})
