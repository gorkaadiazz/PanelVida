// Borrado de la copia local de datos al cerrar sesión.
//
// Solo borra DATOS del usuario. Nunca toca las cachés del service worker
// (la app shell: HTML, JS, CSS e iconos), que no contienen datos personales
// y hacen falta para abrir la app sin conexión.
//
// Antes de llamar a esto, sync/sesion.ts para el motor y cierra su conexión
// (si no, el borrado quedaría esperando a que se cerrase).

const PREFIJO_BD = 'mi-panel'

/**
 * Bases que la app crea con nombre fijo. Se borran SIEMPRE por su nombre,
 * así el borrado no depende de indexedDB.databases() (que no existe en
 * navegadores antiguos). 'mi-panel' es la copia local de sync/bd.ts (datos,
 * cola de cambios pendientes y meta).
 */
export const BASES_CONOCIDAS: readonly string[] = ['mi-panel']

/**
 * Borra las bases de IndexedDB de la app: las conocidas y cualquier otra que
 * empiece por "mi-panel". No lanza: si algo falla, lo deja registrado en la
 * consola y sigue.
 */
export async function limpiarDatosLocales(): Promise<void> {
  if (typeof indexedDB === 'undefined') return

  const nombres = new Set(BASES_CONOCIDAS)
  if (typeof indexedDB.databases === 'function') {
    try {
      for (const base of await indexedDB.databases()) {
        if (typeof base.name === 'string' && base.name.startsWith(PREFIJO_BD)) nombres.add(base.name)
      }
    } catch (error) {
      console.error('No se pudo consultar la lista de bases locales', error)
    }
  }

  await Promise.all([...nombres].map(borrarBase))
}

function borrarBase(nombre: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const peticion = indexedDB.deleteDatabase(nombre)
      peticion.onsuccess = () => resolve()
      peticion.onerror = () => resolve()
      // Si hay una conexión abierta (otra pestaña), el borrado queda pendiente
      // y termina cuando se cierre; no bloqueamos el cierre de sesión por eso.
      peticion.onblocked = () => resolve()
    } catch (error) {
      console.error('No se pudo borrar la copia local', error)
      resolve()
    }
  })
}
