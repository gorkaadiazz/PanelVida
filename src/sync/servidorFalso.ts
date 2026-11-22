// SOLO PARA TESTS. Un "Supabase" de mentira en memoria que cumple el contrato
// de Remoto e imita lo que hace el servidor de verdad:
//  · trigger antes_de_guardar: en un conflicto gana el updated_at más
//    reciente y sync_at lo pone siempre el servidor;
//  · trigger despues_de_borrar: apunta cada borrado en `borrados`;
//  · on delete cascade de las tablas hijas y su clave foránea;
//  · restricciones (se simulan con `rechazar`).
//  · OPCIONAL (`{ hogar: true }`): las tablas compartidas (Lista de casa) con
//    varios usuarios: cada uno ve solo las filas de su hogar (es_miembro),
//    sus borrados van a `borrados_hogar` (no a `borrados`), no reviven
//    (no_revivir_borrado_hogar) y marcado_por lo pone el servidor. Cada
//    usuario usa su propia vista: `servidor.como('otro')`.
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
  /** Solo con `{ hogar: true }`: hogar de cada usuario (quitarlo = expulsar). */
  hogarDe: Map<string, string>
  /** Solo con `{ hogar: true }`: el servidor visto por OTRO usuario (otro miembro del hogar). */
  como(usuario: string): Remoto
  /** Lo apuntado en borrados_hogar (con su hogar). */
  borradosHogar(): (Borrado & { hogar_id: string })[]
}

export interface OpcionesServidorFalso {
  /** Activa miHogar, descargarBorradosHogar y el RLS de las tablas compartidas. */
  hogar?: boolean
}

/** Usuario de la vista por defecto del servidor falso. */
export const USUARIO_FALSO = 'usuario-del-servidor'

export function crearServidorFalso(tablas: readonly DefTabla[] = TABLAS, opciones: OpcionesServidorFalso = {}): ServidorFalso {
  const datos = new Map<string, Map<string, FilaRemota>>(tablas.map((t) => [t.nombre, new Map()]))
  const borrados: Borrado[] = []
  const borradosHogar: (Borrado & { hogar_id: string })[] = []
  const conHogar = opciones.hogar === true
  const hogarDe = new Map<string, string>()
  /** ¿Es una tabla compartida con el hogar (y está activado el modo hogar)? */
  const compartida = (nombre: string) => conHogar && tablas.some((t) => t.nombre === nombre && t.compartida)
  /** RLS es_miembro(hogar_id) */
  const visible = (quien: string, fila: Record<string, unknown>) => hogarDe.has(quien) && hogarDe.get(quien) === fila.hogar_id
  const errorRls = (nombre: string) => ({ code: '42501', message: `new row violates row-level security policy for table "${nombre}"` })
  let reloj = Date.parse('2026-11-13T10:00:00.000Z')
  let inicializada = false
  const tic = () => new Date((reloj += 1000)).toISOString()

  const tabla = (nombre: string) => {
    const t = datos.get(nombre)
    if (!t) throw { code: '42P01', message: `relation "${nombre}" does not exist` }
    return t
  }

  function comprobar(nombre: string, fila: Record<string, unknown>, quien: string) {
    if (compartida(nombre)) {
      const id = String(fila.id)
      const vieja = tabla(nombre).get(id)
      const borrada = !vieja && borradosHogar.some((b) => b.tabla === nombre && b.fila_id === id)
      // no_revivir_borrado_hogar va antes que el RLS: la fila se ignora sin error
      if (!borrada && (!visible(quien, fila) || (vieja && !visible(quien, vieja)))) throw errorRls(nombre)
    }
    const codigo = servidor.rechazar?.(nombre, fila)
    if (codigo) {
      // Mismo texto que PostgREST cuando es una política RLS la que rechaza la fila
      const message = codigo === '42501' ? `new row violates row-level security policy for table "${nombre}"` : `fila rechazada (${codigo})`
      throw { code: codigo, message }
    }
    const def = tablas.find((t) => t.nombre === nombre)
    if (def?.padre && !tabla(def.padre.tabla).has(String(fila[def.padre.columna]))) {
      throw { code: '23503', message: 'violates foreign key constraint' }
    }
  }

  function escribir(nombre: string, fila: Record<string, unknown>, quien: string = USUARIO_FALSO) {
    const t = tabla(nombre)
    const id = String(fila.id)
    const vieja = t.get(id)
    // Como el trigger no_revivir_borrado (todas las tablas de Mi Panel): una fila borrada no se vuelve a crear
    if (!vieja && borrados.some((b) => b.tabla === nombre && b.fila_id === id)) return
    if (!vieja && compartida(nombre) && borradosHogar.some((b) => b.tabla === nombre && b.fila_id === id)) return
    const updated_at = typeof fila.updated_at === 'string' ? fila.updated_at : tic()
    if (vieja && Date.parse(updated_at) < Date.parse(vieja.updated_at)) return // versión antigua: se queda la que había
    let extra: Record<string, unknown> = {}
    if (compartida(nombre)) {
      // casa_antes_de_guardar: el hogar no cambia y marcado_por lo pone el servidor
      const comprado = fila.comprado === true
      const yaComprado = vieja?.comprado === true
      extra = {
        hogar_id: vieja?.hogar_id ?? fila.hogar_id,
        marcado_por: !comprado ? null : yaComprado ? vieja?.marcado_por : quien,
        comprado_en: !comprado ? null : (fila.comprado_en ?? vieja?.comprado_en ?? new Date(reloj).toISOString()),
      }
    }
    t.set(id, {
      ...vieja,
      ...fila,
      ...extra,
      id,
      user_id: compartida(nombre) ? (vieja?.user_id ?? quien) : USUARIO_FALSO,
      created_at: vieja?.created_at ?? (typeof fila.created_at === 'string' ? fila.created_at : tic()),
      updated_at,
      sync_at: tic(),
    })
  }

  function quitar(nombre: string, id: string) {
    const vieja = tabla(nombre).get(id)
    if (!tabla(nombre).delete(id)) return
    for (const hija of hijasDe(nombre, tablas)) {
      for (const f of [...tabla(hija.tabla).values()]) {
        if (f[hija.columna] === id) quitar(hija.tabla, f.id)
      }
    }
    // despues_de_borrar_hogar: los borrados de la Lista de casa los leen todos los miembros
    if (compartida(nombre)) borradosHogar.push({ hogar_id: String(vieja?.hogar_id), tabla: nombre, fila_id: id, sync_at: tic() })
    else borrados.push({ tabla: nombre, fila_id: id, sync_at: tic() })
  }

  /** Lo que ve `quien` de una tabla (RLS de las compartidas). */
  const filasDe = (nombre: string, quien: string) => [...tabla(nombre).values()].filter((f) => !compartida(nombre) || visible(quien, f))

  function recibir(peticion: string) {
    servidor.peticiones.push(peticion)
    const error = servidor.fallo?.(peticion)
    if (error) throw error
  }

  const porSync = (a: { sync_at: string }, b: { sync_at: string }) => Date.parse(a.sync_at) - Date.parse(b.sync_at)


  function vista(quien: string): Remoto {
    const r: Remoto = {
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
        for (const fila of filas) comprobar(nombre, fila, quien) // el lote entero falla si una fila no vale
        for (const fila of filas) escribir(nombre, fila, quien)
      },

      async borrar(nombre, ids) {
        recibir(`borrar ${nombre} x${ids.length}`)
        // Con RLS, borrar lo que no se ve no da error: simplemente no borra nada
        for (const id of ids) {
          const f = tabla(nombre).get(id)
          if (f && compartida(nombre) && !visible(quien, f)) continue
          quitar(nombre, id)
        }
      },

      async obtener(nombre, ids) {
        recibir(`obtener ${nombre} x${ids.length}`)
        return ids.flatMap((id) => {
          const f = tabla(nombre).get(id)
          return f && (!compartida(nombre) || visible(quien, f)) ? [f] : []
        })
      },

      async descargar(nombre, desde, desplazamiento, limite) {
        await servidor.antesDeDescargar?.(nombre)
        recibir(`descargar ${nombre}`)
        return filasDe(nombre, quien)
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
    if (!conHogar) return r
    return {
      ...r,
      async miHogar() {
        recibir('mi hogar')
        return hogarDe.get(quien) ?? null
      },
      async descargarBorradosHogar(desde, desplazamiento, limite) {
        recibir('descargar borrados_hogar')
        const mio = hogarDe.get(quien)
        return borradosHogar
          .filter((b) => b.hogar_id === mio && Date.parse(b.sync_at) > Date.parse(desde))
          .sort(porSync)
          .slice(desplazamiento, desplazamiento + limite)
          .map(({ tabla, fila_id, sync_at }) => ({ tabla, fila_id, sync_at }))
      },
    }
  }

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

    hogarDe,
    borradosHogar: () => borradosHogar.map((b) => ({ ...b })),
    como: (usuario) => vista(usuario),
    ...vista(USUARIO_FALSO),
  }
  return servidor
}
