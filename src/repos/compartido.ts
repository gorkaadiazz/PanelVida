// Lo que llega con «Compartir → Mi Panel» en Android. El service worker
// (public/share-sw.js) lo deja en la base «mi-panel-compartido» y el Puente
// lo recoge aquí UNA vez (se borra al leerlo). Esa base también se borra al
// cerrar sesión (lib/limpieza.ts borra todas las «mi-panel*»).

import { unirCompartido } from '../lib/puente'

const BASE_COMPARTIDO = 'mi-panel-compartido'
/** Lo compartido hace más de 10 minutos ya no se ofrece (p. ej. se compartió sin sesión). */
const CADUCA_MS = 10 * 60 * 1000

export interface Compartido {
  texto: string
  archivos: File[]
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const peticion = indexedDB.open(BASE_COMPARTIDO, 1)
    peticion.onupgradeneeded = () => peticion.result.createObjectStore('pendiente')
    peticion.onsuccess = () => resolve(peticion.result)
    peticion.onerror = () => reject(peticion.error)
  })
}

/** Saca lo compartido pendiente (y lo borra). null si no hay nada. */
export async function recogerCompartido(): Promise<Compartido | null> {
  if (typeof indexedDB === 'undefined') return null
  const base = await abrir()
  try {
    const datos = await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
      const tx = base.transaction('pendiente', 'readwrite')
      const almacen = tx.objectStore('pendiente')
      const peticion = almacen.get('ultimo')
      peticion.onsuccess = () => {
        almacen.delete('ultimo')
        resolve(peticion.result as Record<string, unknown> | undefined)
      }
      tx.onerror = () => reject(tx.error)
    })
    if (!datos || typeof datos.cuando !== 'number' || Date.now() - datos.cuando > CADUCA_MS) return null
    const cadena = (v: unknown) => (typeof v === 'string' ? v : '')
    const archivos = Array.isArray(datos.archivos) ? datos.archivos.filter((a): a is File => a instanceof Blob && 'name' in a) : []
    const texto = unirCompartido(cadena(datos.titulo), cadena(datos.texto), cadena(datos.enlace))
    if (!texto && archivos.length === 0) return null
    return { texto, archivos }
  } finally {
    base.close()
  }
}
