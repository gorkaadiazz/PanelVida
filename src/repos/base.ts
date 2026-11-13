// Base común de los repositorios (portado de js/repos/base.js).
//
// Toda lectura y escritura de datos de las pantallas pasa por los
// repositorios, y estos por aquí: cada cambio se guarda en la copia local
// (IndexedDB) y se apunta en la cola EN LA MISMA TRANSACCIÓN; el motor de
// sync/ lo sube a Supabase cuando hay conexión. Nada de esto necesita red.

import { uuid } from '../lib/uuid'
import { avisarCambio } from '../sync/avisos'
import { ALMACEN_COLA, baseActual, pedir } from '../sync/bd'
import { borrarLocal, encolar } from '../sync/cola'
import { TABLAS, type FilaLocal, type NombreTabla, type TablaEscribible } from '../sync/tablas'

/** La fila que se quiere tocar ya no existe (p. ej. se borró en otro dispositivo). */
export class ErrorNoEncontrado extends Error {
  constructor(mensaje = 'Ese elemento ya no existe.') {
    super(mensaje)
    this.name = 'ErrorNoEncontrado'
  }
}

type Sellos = 'id' | 'created_at' | 'updated_at' | 'user_id' | 'sync_at'

/** Columnas propias de una tabla (sin id ni marcas de tiempo). */
export type Datos<T extends TablaEscribible> = Omit<FilaLocal<T>, Sellos>

/** Operaciones disponibles dentro de `transaccion`. Todas van en la misma transacción. */
export interface Escritor {
  obtener<T extends NombreTabla>(tabla: T, id: string): Promise<FilaLocal<T> | undefined>
  todos<T extends NombreTabla>(tabla: T): Promise<FilaLocal<T>[]>
  /** Crea una fila con id nuevo (o el `id` indicado) y la apunta en la cola. */
  crear<T extends TablaEscribible>(tabla: T, datos: Datos<T>, id?: string): FilaLocal<T>
  /** Guarda una fila existente con los cambios y la apunta en la cola. */
  actualizar<T extends TablaEscribible>(tabla: T, anterior: FilaLocal<T>, cambios: Partial<Datos<T>>): FilaLocal<T>
  /** Borra una fila (y sus hijas, como hará el servidor) y apunta el borrado en la cola. */
  borrar(tabla: TablaEscribible, id: string): Promise<void>
}

/**
 * `updated_at` de un cambio hecho ahora. En un conflicto gana el más
 * reciente, así que nunca puede ser anterior al que ya tenía la fila (pasaría
 * si el reloj del dispositivo va atrasado): el servidor ignoraría el cambio.
 */
export function sellar(anterior?: string): string {
  const ahora = Date.now()
  const previo = anterior ? Date.parse(anterior) : NaN
  return new Date(Number.isNaN(previo) ? ahora : Math.max(ahora, previo + 1)).toISOString()
}

const ALMACENES = [...TABLAS.map((t) => t.nombre), ALMACEN_COLA]

/**
 * Ejecuta varias lecturas y escrituras como una sola operación: o se guarda
 * todo (con sus apuntes en la cola) o nada. Al terminar avisa a los hooks.
 * Dentro de `fn` solo se puede esperar (await) a las operaciones del escritor.
 */
export async function transaccion<R>(fn: (e: Escritor) => R | Promise<R>): Promise<R> {
  const base = await baseActual()
  const tocadas = new Set<string>()
  const resultado = await base.tx(ALMACENES, 'readwrite', (t) => {
    const escritor: Escritor = {
      obtener: <T extends NombreTabla>(tabla: T, id: string) =>
        pedir(t.objectStore(tabla).get(id) as IDBRequest<FilaLocal<T> | undefined>),
      todos: <T extends NombreTabla>(tabla: T) => pedir(t.objectStore(tabla).getAll() as IDBRequest<FilaLocal<T>[]>),
      crear<T extends TablaEscribible>(tabla: T, datos: Datos<T>, id: string = uuid()) {
        const ahora = sellar()
        const fila = { ...datos, id, created_at: ahora, updated_at: ahora } as unknown as FilaLocal<T>
        t.objectStore(tabla).put(fila)
        encolar(t, tabla, 'upsert', id)
        tocadas.add(tabla)
        return fila
      },
      actualizar<T extends TablaEscribible>(tabla: T, anterior: FilaLocal<T>, cambios: Partial<Datos<T>>) {
        const fila = { ...anterior, ...cambios, id: anterior.id, created_at: anterior.created_at, updated_at: sellar(anterior.updated_at) }
        t.objectStore(tabla).put(fila)
        encolar(t, tabla, 'upsert', anterior.id)
        tocadas.add(tabla)
        return fila
      },
      async borrar(tabla, id) {
        // Las hijas se borran aquí sin apuntarlas: en el servidor caen en cascada.
        for (const nombre of await borrarLocal(t, tabla, id, TABLAS)) tocadas.add(nombre)
        encolar(t, tabla, 'delete', id)
        tocadas.add(tabla)
      },
    }
    return fn(escritor)
  })
  avisarCambio([...tocadas], 'local')
  return resultado
}

/** Todas las filas de una tabla en la copia local. */
export async function listar<T extends NombreTabla>(tabla: T): Promise<FilaLocal<T>[]> {
  return (await baseActual()).todos<FilaLocal<T>>(tabla)
}

/** Una fila por su id (undefined si no existe). */
export async function obtener<T extends NombreTabla>(tabla: T, id: string): Promise<FilaLocal<T> | undefined> {
  return (await baseActual()).obtener<FilaLocal<T>>(tabla, id)
}

/** Filas con un valor en una columna indexada (ver `indices` en sync/tablas.ts). */
export async function listarPorIndice<T extends NombreTabla>(tabla: T, indice: string, valor: IDBValidKey): Promise<FilaLocal<T>[]> {
  return (await baseActual()).porIndice<FilaLocal<T>>(tabla, indice, valor)
}
