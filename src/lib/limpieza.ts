// Borrado de la copia local de datos al cerrar sesión.
//
// Solo borra DATOS del usuario. Nunca toca las cachés del service worker
// (la app shell: HTML, JS, CSS e iconos), que no contienen datos personales
// y hacen falta para abrir la app sin conexión.

const PREFIJO_BD = 'mi-panel'

/**
 * Borra las bases de IndexedDB de la app (las que empiezan por "mi-panel").
 * No lanza: si algo falla, lo deja registrado en la consola y sigue.
 */
export async function limpiarDatosLocales(): Promise<void> {
  if (typeof indexedDB === 'undefined') return

  // indexedDB.databases() no existe en navegadores antiguos (Firefox < 126).
  // TODO(sync): cuando exista la capa sync/, borrar también por nombre fijo
  // sus bases conocidas, para que el borrado no dependa de databases().
  if (typeof indexedDB.databases !== 'function') return

  try {
    const bases = await indexedDB.databases()
    const nombres = bases
      .map((b) => b.name)
      .filter((nombre): nombre is string => typeof nombre === 'string' && nombre.startsWith(PREFIJO_BD))
    await Promise.all(nombres.map(borrarBase))
  } catch (error) {
    console.error('No se pudo borrar la copia local', error)
  }

  // TODO(sync): vaciar también la caché en memoria y la cola de cambios
  // pendientes de la capa sync/ cuando exista.
}

function borrarBase(nombre: string): Promise<void> {
  return new Promise((resolve) => {
    const peticion = indexedDB.deleteDatabase(nombre)
    peticion.onsuccess = () => resolve()
    peticion.onerror = () => resolve()
    // Si hay una conexión abierta, el borrado queda pendiente y termina
    // cuando se cierre; no bloqueamos el cierre de sesión por eso.
    peticion.onblocked = () => resolve()
  })
}
