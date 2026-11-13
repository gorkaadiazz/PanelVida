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

  it('sin indexedDB.databases() borra igualmente la base conocida por su nombre', async () => {
    const deleteDatabase = vi.fn(() => {
      const peticion: Peticion = {}
      queueMicrotask(() => peticion.onsuccess?.())
      return peticion
    })
    vi.stubGlobal('indexedDB', { deleteDatabase })
    await expect(limpiarDatosLocales()).resolves.toBeUndefined()
    expect(deleteDatabase.mock.calls.map((c: unknown[]) => c[0])).toEqual(['mi-panel'])
  })

  it('borra la base conocida aunque databases() no la liste', async () => {
    const { deleteDatabase } = indexedDBFalso(['otra-app'])
    await limpiarDatosLocales()
    expect(deleteDatabase.mock.calls.map((c: unknown[]) => c[0])).toEqual(['mi-panel'])
  })

  it('no lanza si deleteDatabase lanza', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('indexedDB', {
      deleteDatabase: () => {
        throw new Error('roto')
      },
    })
    await expect(limpiarDatosLocales()).resolves.toBeUndefined()
    expect(error).toHaveBeenCalled()
  })

  it('si databases() falla, borra al menos la base conocida', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const deleteDatabase = vi.fn(() => {
      const peticion: Peticion = {}
      queueMicrotask(() => peticion.onsuccess?.())
      return peticion
    })
    vi.stubGlobal('indexedDB', { databases: vi.fn(async () => Promise.reject(new Error('roto'))), deleteDatabase })
    await expect(limpiarDatosLocales()).resolves.toBeUndefined()
    expect(error).toHaveBeenCalled()
    expect(deleteDatabase.mock.calls.map((c: unknown[]) => c[0])).toEqual(['mi-panel'])
  })
})
