// Copia local de los datos en IndexedDB (portado de js/sync/db.js).
//
// Cada tabla declarada en tablas.ts tiene aquí un almacén con el mismo nombre
// y las mismas filas que en Supabase, más dos almacenes propios:
//   cola  cambios pendientes de subir (una entrada por fila, clave "tabla:id")
//   meta  datos sueltos (de quién es la copia, última descarga…)
//
// Sin dependencias: basta con la API de IndexedDB del navegador y un par de
// funciones para convertir sus peticiones en promesas.
//
// DE QUIÉN ES LA COPIA: la base se abre siempre para un usuario concreto. Si
// lo que hay guardado es de otra cuenta (o no se sabe de quién), se vacía
// antes de usarla: nunca se enseñan datos de otro usuario.

import { TABLAS, indicesDe, type DefTabla } from './tablas'

/** Nombre fijo: así limpieza.ts puede borrarla sin depender de indexedDB.databases(). */
export const NOMBRE_BD = 'mi-panel'
export const ALMACEN_COLA = 'cola'
export const ALMACEN_META = 'meta'

export interface BaseLocal {
  readonly usuarioId: string
  /** true cuando se ha cerrado (cierre de sesión): ya no acepta operaciones. */
  readonly cerrada: boolean
  todos<T>(almacen: string): Promise<T[]>
  obtener<T>(almacen: string, clave: string): Promise<T | undefined>
  porIndice<T>(almacen: string, indice: string, valor: IDBValidKey): Promise<T[]>
  contar(almacen: string): Promise<number>
  /**
   * Ejecuta `fn` dentro de una transacción y resuelve con su resultado cuando
   * la transacción termina entera: todo lo que se escriba dentro se guarda
   * junto o no se guarda nada. Dentro de `fn` solo se puede esperar (await) a
   * peticiones de la propia transacción (con `pedir`).
   */
  tx<T>(almacenes: readonly string[], modo: IDBTransactionMode, fn: (t: IDBTransaction) => T | Promise<T>): Promise<T>
  leerMeta<T>(clave: string): Promise<T | undefined>
  guardarMeta(clave: string, valor: unknown): Promise<void>
  /** Vacía todos los almacenes (datos, cola y meta). */
  vaciar(): Promise<void>
  cerrar(): void
}

/** Convierte una petición de IndexedDB en una promesa. */
export function pedir<T>(peticion: IDBRequest<T>): Promise<T> {
  return new Promise((ok, ko) => {
    peticion.onsuccess = () => ok(peticion.result)
    peticion.onerror = () => ko(peticion.error ?? new Error('Error de IndexedDB'))
  })
}

function abrirPeticion(version: number | undefined, alActualizar: (bd: IDBDatabase, t: IDBTransaction) => void): Promise<IDBDatabase> {
  return new Promise((ok, ko) => {
    const peticion = version === undefined ? indexedDB.open(NOMBRE_BD) : indexedDB.open(NOMBRE_BD, version)
    peticion.onupgradeneeded = () => {
      if (peticion.transaction) alActualizar(peticion.result, peticion.transaction)
    }
    peticion.onsuccess = () => ok(peticion.result)
    peticion.onerror = () => ko(peticion.error ?? new Error('No se pudo abrir la copia local'))
    // onblocked no es un fallo: la apertura sigue esperando a que la otra
    // pestaña suelte su conexión (lo hace sola con onversionchange).
  })
}

/** Crea los almacenes e índices que falten. */
function crearEsquema(bd: IDBDatabase, t: IDBTransaction, tablas: readonly DefTabla[]) {
  for (const tabla of tablas) {
    const almacen = bd.objectStoreNames.contains(tabla.nombre)
      ? t.objectStore(tabla.nombre)
      : bd.createObjectStore(tabla.nombre, { keyPath: 'id' })
    for (const columna of indicesDe(tabla)) {
      if (!almacen.indexNames.contains(columna)) almacen.createIndex(columna, columna)
    }
  }
  if (!bd.objectStoreNames.contains(ALMACEN_COLA)) bd.createObjectStore(ALMACEN_COLA, { keyPath: 'clave' })
  if (!bd.objectStoreNames.contains(ALMACEN_META)) bd.createObjectStore(ALMACEN_META, { keyPath: 'clave' })
}

/** ¿Falta algún almacén o índice de los declarados? */
function esquemaIncompleto(bd: IDBDatabase, tablas: readonly DefTabla[]): boolean {
  const nombres = [...tablas.map((t) => t.nombre), ALMACEN_COLA, ALMACEN_META]
  if (nombres.some((n) => !bd.objectStoreNames.contains(n))) return true
  const conIndices = tablas.filter((t) => indicesDe(t).length)
  if (!conIndices.length) return false
  const t = bd.transaction(
    conIndices.map((x) => x.nombre),
    'readonly',
  )
  return conIndices.some((tabla) => indicesDe(tabla).some((col) => !t.objectStore(tabla.nombre).indexNames.contains(col)))
}

/**
 * Abre la base con todos los almacenes declarados. No hay un número de
 * versión escrito a mano: si al abrir falta algo (tabla nueva en tablas.ts),
 * se vuelve a abrir con la versión siguiente para crearlo.
 */
async function abrirConexion(tablas: readonly DefTabla[]): Promise<IDBDatabase> {
  let bd = await abrirPeticion(undefined, (nueva, t) => crearEsquema(nueva, t, tablas))
  if (esquemaIncompleto(bd, tablas)) {
    const siguiente = bd.version + 1
    bd.close()
    bd = await abrirPeticion(siguiente, (nueva, t) => crearEsquema(nueva, t, tablas))
  }
  return bd
}

/**
 * Abre la copia local para un usuario. Si lo guardado era de otra cuenta, se
 * vacía primero.
 */
export async function abrirBase(usuarioId: string, tablas: readonly DefTabla[] = TABLAS): Promise<BaseLocal> {
  if (!usuarioId) throw new Error('Hace falta un usuario para abrir la copia local')
  const bd = await abrirConexion(tablas)
  const almacenes = [...tablas.map((t) => t.nombre), ALMACEN_COLA, ALMACEN_META]
  let cerrada = false

  // Si otra pestaña quiere actualizar o borrar la base, se suelta la conexión
  // para no bloquearla (p. ej. al cerrar sesión en la otra pestaña).
  bd.onversionchange = () => {
    cerrada = true
    bd.close()
  }

  function comprobar() {
    if (cerrada) throw new Error('La copia local está cerrada')
  }

  function tx<T>(nombres: readonly string[], modo: IDBTransactionMode, fn: (t: IDBTransaction) => T | Promise<T>): Promise<T> {
    return new Promise<T>((ok, ko) => {
      let t: IDBTransaction
      try {
        comprobar()
        t = bd.transaction([...nombres], modo)
      } catch (e) {
        ko(e instanceof Error ? e : new Error(String(e)))
        return
      }
      let resultado: T
      let fallo: unknown
      t.oncomplete = () => ok(resultado)
      t.onerror = () => ko(fallo ?? t.error ?? new Error('Error al guardar en la copia local'))
      t.onabort = () => ko(fallo ?? t.error ?? new Error('Se canceló el guardado en la copia local'))
      const fallar = (e: unknown) => {
        fallo = e
        try {
          t.abort()
        } catch {
          // La transacción ya había terminado
          ko(e instanceof Error ? e : new Error(String(e)))
        }
      }
      // `fn` se llama ya, de forma síncrona: la transacción solo admite
      // peticiones mientras está activa (no sobrevive a un setTimeout o fetch).
      try {
        Promise.resolve(fn(t)).then((valor) => {
          resultado = valor
        }, fallar)
      } catch (e) {
        fallar(e)
      }
    })
  }

  const leer = <T>(almacen: string, fn: (a: IDBObjectStore) => IDBRequest<T>) => tx([almacen], 'readonly', (t) => pedir(fn(t.objectStore(almacen))))

  const base: BaseLocal = {
    usuarioId,
    get cerrada() {
      return cerrada
    },
    todos: <T>(almacen: string) => leer<T[]>(almacen, (a) => a.getAll() as IDBRequest<T[]>),
    obtener: <T>(almacen: string, clave: string) => leer<T | undefined>(almacen, (a) => a.get(clave) as IDBRequest<T | undefined>),
    porIndice: <T>(almacen: string, indice: string, valor: IDBValidKey) =>
      leer<T[]>(almacen, (a) => a.index(indice).getAll(valor) as IDBRequest<T[]>),
    contar: (almacen) => leer(almacen, (a) => a.count()),
    tx,
    async leerMeta<T>(clave: string) {
      const fila = await base.obtener<{ clave: string; valor: T }>(ALMACEN_META, clave)
      return fila?.valor
    },
    guardarMeta: (clave, valor) =>
      tx([ALMACEN_META], 'readwrite', (t) => {
        t.objectStore(ALMACEN_META).put({ clave, valor })
      }),
    vaciar: () =>
      tx(almacenes, 'readwrite', (t) => {
        for (const nombre of almacenes) t.objectStore(nombre).clear()
      }),
    cerrar() {
      if (cerrada) return
      cerrada = true
      bd.close()
    },
  }

  try {
    const dueno = await base.leerMeta<string>('usuario')
    if (dueno !== usuarioId) {
      // De otra cuenta, o de nadie conocido: fuera todo antes de empezar.
      await tx(almacenes, 'readwrite', (t) => {
        for (const nombre of almacenes) t.objectStore(nombre).clear()
        t.objectStore(ALMACEN_META).put({ clave: 'usuario', valor: usuarioId })
      })
    }
  } catch (e) {
    base.cerrar()
    throw e
  }

  return base
}

/** Borra la base entera. No lanza. Si otra pestaña la tiene abierta, termina cuando la suelte. */
export function borrarBase(): Promise<void> {
  return new Promise((ok) => {
    if (typeof indexedDB === 'undefined') return ok()
    try {
      const peticion = indexedDB.deleteDatabase(NOMBRE_BD)
      peticion.onsuccess = () => ok()
      peticion.onerror = () => ok()
      peticion.onblocked = () => ok()
    } catch {
      ok()
    }
  })
}

// ---------------------------------------------------------------------------
// La copia local de la sesión en curso
// ---------------------------------------------------------------------------

/** No hay sesión iniciada (o se acaba de cerrar): no hay copia local que leer. */
export class ErrorSinSesion extends Error {
  constructor() {
    super('No hay ninguna sesión iniciada')
    this.name = 'ErrorSinSesion'
  }
}

let actual: Promise<BaseLocal> | null = null

/** La fija sesion.ts al iniciar sesión (y la quita al cerrarla). */
export function usarBase(base: Promise<BaseLocal> | null) {
  actual = base
  // Si falla al abrir, el error lo recibe quien la use; aquí solo se evita el
  // aviso de "promesa rechazada sin atender".
  base?.catch(() => {})
}

/** La copia local del usuario con sesión. Los repositorios leen y escriben aquí. */
export function baseActual(): Promise<BaseLocal> {
  return actual ?? Promise.reject(new ErrorSinSesion())
}
