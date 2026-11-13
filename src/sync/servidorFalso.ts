// SOLO PARA TESTS. Un "Supabase" de mentira en memoria que cumple el contrato
// de Remoto e imita lo que hace el servidor de verdad:
//  · trigger antes_de_guardar: en un conflicto gana el updated_at más
//    reciente y sync_at lo pone siempre el servidor;
//  · trigger despues_de_borrar: apunta cada borrado en `borrados`;
//  · on delete cascade de las tablas hijas y su clave foránea;
//  · restricciones (se simulan con `rechazar`).
// No se importa desde la app, así que no acaba en el paquete final.

import type { Borrado, FilaRemota, Remoto } from './remoto'
import { TABLAS, hijasDe, type DefTabla } from './tablas'

export interface ServidorFalso extends Remoto {
  /** Filas que hay ahora mismo en una tabla. */
  filas(tabla: string): FilaRemota[]
  fila(tabla: string, id: string): FilaRemota | undefined
  /** Escribe como lo haría OTRO dispositivo (pasa por las mismas reglas). */
  desdeOtroDispositivo(tabla: string, fila: Record<string, unknown>): void
  borrarDesdeOtroDispositivo(tabla: string, id: string): void
  /** Peticiones recibidas, en orden: "guardar habitos x2", "borrar tareas x1"… */
  peticiones: string[]
  /** Si se define y devuelve un error, la siguiente petición falla con él. */
  fallo: ((peticion: string) => unknown) | null
  /** Si devuelve un código de Postgres, esa fila se rechaza (y el lote entero, como en PostgREST). */
  rechazar: ((tabla: string, fila: Record<string, unknown>) => string | null) | null
  /** Se llama justo antes de guardar (para simular cambios locales a mitad de subida). */
  antesDeGuardar: (() => Promise<void>) | null
  /** Se llama justo antes de responder a una descarga de esa tabla. */
  antesDeDescargar: ((tabla: string) => Promise<void>) | null
  /** Hábitos que crea inicializar_cuenta la primera vez. */
  semilla: Record<string, unknown>[]
  vecesInicializada: number
}

export function crearServidorFalso(tablas: readonly DefTabla[] = TABLAS): ServidorFalso {
  const datos = new Map<string, Map<string, FilaRemota>>(tablas.map((t) => [t.nombre, new Map()]))
  const borrados: Borrado[] = []
  let reloj = Date.parse('2026-11-13T10:00:00.000Z')
  let inicializada = false
  const tic = () => new Date((reloj += 1000)).toISOString()

  const tabla = (nombre: string) => {
    const t = datos.get(nombre)
    if (!t) throw { code: '42P01', message: `relation "${nombre}" does not exist` }
    return t
  }

  function comprobar(nombre: string, fila: Record<string, unknown>) {
    const codigo = servidor.rechazar?.(nombre, fila)
    if (codigo) throw { code: codigo, message: `fila rechazada (${codigo})` }
    const def = tablas.find((t) => t.nombre === nombre)
    if (def?.padre && !tabla(def.padre.tabla).has(String(fila[def.padre.columna]))) {
      throw { code: '23503', message: 'violates foreign key constraint' }
    }
  }

  function escribir(nombre: string, fila: Record<string, unknown>) {
    const t = tabla(nombre)
    const id = String(fila.id)
    const vieja = t.get(id)
    const updated_at = typeof fila.updated_at === 'string' ? fila.updated_at : tic()
    if (vieja && Date.parse(updated_at) < Date.parse(vieja.updated_at)) return // versión antigua: se queda la que había
    t.set(id, {
      ...vieja,
      ...fila,
      id,
      user_id: 'usuario-del-servidor',
      created_at: vieja?.created_at ?? (typeof fila.created_at === 'string' ? fila.created_at : tic()),
      updated_at,
      sync_at: tic(),
    })
  }

  function quitar(nombre: string, id: string) {
    if (!tabla(nombre).delete(id)) return
    for (const hija of hijasDe(nombre, tablas)) {
      for (const f of [...tabla(hija.tabla).values()]) {
        if (f[hija.columna] === id) quitar(hija.tabla, f.id)
      }
    }
    borrados.push({ tabla: nombre, fila_id: id, sync_at: tic() })
  }

  function recibir(peticion: string) {
    servidor.peticiones.push(peticion)
    const error = servidor.fallo?.(peticion)
    if (error) throw error
  }

  const porSync = (a: { sync_at: string }, b: { sync_at: string }) => Date.parse(a.sync_at) - Date.parse(b.sync_at)

  const servidor: ServidorFalso = {
    peticiones: [],
    fallo: null,
    rechazar: null,
    antesDeGuardar: null,
    antesDeDescargar: null,
    semilla: [],
    vecesInicializada: 0,

    filas: (nombre) => [...tabla(nombre).values()],
    fila: (nombre, id) => tabla(nombre).get(id),
    desdeOtroDispositivo: (nombre, fila) => escribir(nombre, fila),
    borrarDesdeOtroDispositivo: (nombre, id) => quitar(nombre, id),

    async inicializarCuenta() {
      recibir('inicializar_cuenta')
      servidor.vecesInicializada += 1
      if (inicializada) return false
      inicializada = true
      for (const fila of servidor.semilla) escribir('habitos', fila)
      return true
    },

    async guardar(nombre, filas) {
      await servidor.antesDeGuardar?.()
      recibir(`guardar ${nombre} x${filas.length}`)
      for (const fila of filas) comprobar(nombre, fila) // el lote entero falla si una fila no vale
      for (const fila of filas) escribir(nombre, fila)
    },

    async borrar(nombre, ids) {
      recibir(`borrar ${nombre} x${ids.length}`)
      for (const id of ids) quitar(nombre, id)
    },

    async obtener(nombre, ids) {
      recibir(`obtener ${nombre} x${ids.length}`)
      return ids.flatMap((id) => tabla(nombre).get(id) ?? [])
    },

    async descargar(nombre, desde, desplazamiento, limite) {
      await servidor.antesDeDescargar?.(nombre)
      recibir(`descargar ${nombre}`)
      return [...tabla(nombre).values()]
        .filter((f) => !desde || Date.parse(f.sync_at) > Date.parse(desde))
        .sort(porSync)
        .slice(desplazamiento, desplazamiento + limite)
        .map((f) => ({ ...f }))
    },

    async descargarBorrados(desde, desplazamiento, limite) {
      recibir('descargar borrados')
      return borrados
        .filter((b) => Date.parse(b.sync_at) > Date.parse(desde))
        .sort(porSync)
        .slice(desplazamiento, desplazamiento + limite)
    },
  }
  return servidor
}
