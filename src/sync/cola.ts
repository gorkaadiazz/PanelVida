// Cola de cambios pendientes de enviar a Supabase (portado de js/sync/cola.js).
// Cada cambio local (guardar o borrar) se apunta aquí en la MISMA transacción
// que el propio cambio. El motor (motor.ts) la va vaciando cuando hay conexión.

import { ALMACEN_COLA, pedir, type BaseLocal } from './bd'
import { claveCola, type EntradaCola, type Operacion } from './reglas'
import { hijasDe, type DefTabla } from './tablas'

let contador = 0

/**
 * Apunta un cambio dentro de una transacción ya abierta (que incluya el
 * almacén 'cola'). La clave es "tabla:id": si una fila cambia varias veces
 * sin conexión solo queda su último cambio, que es el único que hay que subir.
 */
export function encolar(t: IDBTransaction, tabla: string, op: Operacion, id: string) {
  contador += 1
  const entrada: EntradaCola = {
    clave: claveCola(tabla, id),
    tabla,
    op,
    id,
    fecha: new Date().toISOString(),
    // Identifica esta versión del cambio (dos cambios en el mismo milisegundo
    // tendrían la misma fecha)
    rev: `${Date.now()}-${contador}-${Math.random().toString(36).slice(2)}`,
  }
  t.objectStore(ALMACEN_COLA).put(entrada)
}

/** Quita de la cola el cambio pendiente de una fila, si lo hay. */
export function desencolar(t: IDBTransaction, tabla: string, id: string) {
  t.objectStore(ALMACEN_COLA).delete(claveCola(tabla, id))
}

/** Nº de cambios que aún no se han subido. */
export function contarPendientes(base: BaseLocal): Promise<number> {
  return base.contar(ALMACEN_COLA)
}

/** Cambios pendientes (el orden de subida lo decide reglas.planDeSubida). */
export function listarPendientes(base: BaseLocal): Promise<EntradaCola[]> {
  return base.todos<EntradaCola>(ALMACEN_COLA)
}

/**
 * Quita de la cola los cambios ya subidos, salvo los que hayan vuelto a
 * cambiar mientras se subían (esos se subirán en la siguiente vuelta).
 */
export async function quitarSubidos(base: BaseLocal, entradas: readonly EntradaCola[]): Promise<void> {
  if (!entradas.length) return
  await base.tx([ALMACEN_COLA], 'readwrite', async (t) => {
    const cola = t.objectStore(ALMACEN_COLA)
    for (const e of entradas) {
      const actual = await pedir<EntradaCola | undefined>(cola.get(e.clave))
      if (actual && actual.rev === e.rev) cola.delete(e.clave)
    }
  })
}

/**
 * Borra una fila de la copia local SIN apuntarlo en la cola, junto con su
 * cambio pendiente y, en cascada, sus filas hijas (igual que hace el servidor
 * con `on delete cascade`). La transacción debe incluir todos los almacenes
 * de `tablas` y la cola. Devuelve las tablas en las que ha borrado algo.
 */
export async function borrarLocal(t: IDBTransaction, tabla: string, id: string, tablas: readonly DefTabla[]): Promise<string[]> {
  const tocadas = new Set<string>()
  const almacen = t.objectStore(tabla)
  if ((await pedir(almacen.getKey(id))) !== undefined) tocadas.add(tabla)
  almacen.delete(id)
  desencolar(t, tabla, id)
  for (const hija of hijasDe(tabla, tablas)) {
    const claves = await pedir(t.objectStore(hija.tabla).index(hija.columna).getAllKeys(id))
    for (const clave of claves) {
      for (const nombre of await borrarLocal(t, hija.tabla, String(clave), tablas)) tocadas.add(nombre)
    }
  }
  return [...tocadas]
}
