// Motor de sincronización entre la copia local (IndexedDB) y Supabase.
// Portado de js/sync/sincronizar.js de la app de exámenes.
//
//  · Lectura: la app siempre pinta desde IndexedDB; después se descarga lo
//    nuevo del servidor (lo que tenga `sync_at` posterior a la última
//    descarga) y se repinta.
//  · Escritura: cada cambio se guarda en IndexedDB y en la cola. Aquí se sube
//    la cola cuando hay conexión.
//  · Conflictos: gana el cambio con el `updated_at` más reciente. Lo
//    comprueban el trigger `antes_de_guardar` del servidor al subir y
//    reglas.decidirDescarga() al bajar.
//  · Borrados: se suben como cualquier cambio; los de otros dispositivos se
//    descargan de la tabla `borrados`.
//
// El motor no sabe nada del navegador (ni window ni navigator): cuándo se
// lanza cada vuelta lo decide sesion.ts. Así se puede probar en Node con un
// servidor de mentira.

import { ALMACEN_COLA, ALMACEN_META, pedir, type BaseLocal } from './bd'
import { avisarCambio, estadoSync, ponerEstado, type EstadoSync } from './avisos'
import { borrarLocal, contarPendientes, listarPendientes, quitarSubidos } from './cola'
import {
  PAGINA_DESCARGA,
  claveCola,
  decidirDescarga,
  desdeConMargen,
  esErrorDeDatos,
  esErrorDeRed,
  esLaMismaVersion,
  limpiarFila,
  masReciente,
  planDeSubida,
  type EntradaCola,
  type Lote,
} from './reglas'
import type { Borrado, FilaRemota, Remoto } from './remoto'
import { TABLAS, definicion, esTabla, hijasDe, type DefTabla, type Fila } from './tablas'

/** Mensaje para el usuario. El detalle técnico va solo a la consola. */
export const MENSAJE_ERROR_SYNC = 'No se han podido sincronizar los cambios. Se volverá a intentar.'

export interface OpcionesMotor {
  base: BaseLocal
  remoto: Remoto
  /** ¿Hay conexión? (en el navegador, navigator.onLine) */
  enLinea: () => boolean
  tablas?: readonly DefTabla[]
}

export interface Motor {
  /**
   * Sube lo pendiente y baja lo nuevo. Resuelve true si ha ido bien. Si ya
   * hay una sincronización en marcha, espera a que acabe y hace otra vuelta
   * (la que está en marcha puede haber leído la cola antes del último cambio).
   */
  sincronizar(): Promise<boolean>
  /** Vuelve a contar los cambios pendientes y actualiza el estado. */
  refrescarPendientes(): Promise<void>
  /** Para el motor: lo que estuviera a medias se abandona sin escribir nada más. */
  detener(): void
}

class Detenido extends Error {}

export function crearMotor({ base, remoto, enLinea, tablas = TABLAS }: OpcionesMotor): Motor {
  const almacenesDeTablas = tablas.map((t) => t.nombre)
  let detenido = false
  let enMarcha: Promise<boolean> | null = null
  let siguiente: Promise<boolean> | null = null
  let rechazados = 0

  function comprobar() {
    if (detenido) throw new Detenido()
  }

  async function avisar(cambios: Partial<Omit<EstadoSync, 'sincronizando' | 'pendientes' | 'rechazados'>> = {}) {
    if (detenido) return
    let pendientes = estadoSync().pendientes
    try {
      pendientes = await contarPendientes(base)
    } catch {
      // Se queda el último recuento conocido
    }
    if (detenido) return
    ponerEstado({ ...cambios, pendientes, rechazados })
  }

  function sincronizar(): Promise<boolean> {
    if (detenido) return Promise.resolve(false)
    if (enMarcha) {
      siguiente ??= enMarcha.then(() => {
        siguiente = null
        return sincronizar()
      })
      return siguiente
    }
    enMarcha = unaVuelta().finally(() => {
      enMarcha = null
    })
    return enMarcha
  }

  async function unaVuelta(): Promise<boolean> {
    try {
      // Lo primero, sin red: ¿este dispositivo ya tiene los datos de la cuenta?
      if (await base.leerMeta<boolean>('primera_descarga')) ponerEstado({ primeraDescargaHecha: true })
      if (!enLinea()) {
        await avisar({ fase: 'sin-conexion', error: null })
        return false
      }
      await avisar({ fase: 'sincronizando', error: null })
      await prepararCuenta()
      await subir()
      await bajar()
      await avisar({ fase: 'sincronizado', error: null, ultimaSincronizacion: new Date().toISOString(), primeraDescargaHecha: true })
      return true
    } catch (e) {
      if (detenido) return false
      const red = esErrorDeRed(e) || !enLinea()
      if (!red) console.warn('Sincronización', e)
      await avisar({ fase: red ? 'sin-conexion' : 'error', error: red ? null : MENSAJE_ERROR_SYNC })
      return false
    }
  }

  // -------------------------------------------------------------------------
  // Primera vez
  // -------------------------------------------------------------------------

  /**
   * Crea en el servidor los datos iniciales de la cuenta (hábitos de ejemplo,
   * módulos…). La RPC es idempotente; aun así solo se llama hasta que sale
   * bien una vez en este dispositivo. Lo que cree se descarga en bajar().
   */
  async function prepararCuenta() {
    if (await base.leerMeta<boolean>('cuenta_inicializada')) return
    try {
      await remoto.inicializarCuenta()
    } catch (e) {
      if (esErrorDeRed(e)) throw e
      // Un fallo aquí no debe impedir subir y bajar los datos: se avisa en la
      // consola y se reintenta en la próxima vuelta.
      console.warn('No se pudo inicializar la cuenta', e)
      return
    }
    comprobar()
    await base.guardarMeta('cuenta_inicializada', true)
  }

  // -------------------------------------------------------------------------
  // Subir
  // -------------------------------------------------------------------------

  /**
   * Ejecuta el trabajo de una tabla sin que su fallo pare a las demás. Un
   * error que no es de red ni de datos (p. ej. una migración sin aplicar en
   * el servidor: la tabla o la columna no existen) deja los cambios de ESA
   * tabla en la cola, sin perder nada, y el resto sigue. Sin red, o si se ha
   * parado el motor, se corta todo como siempre.
   */
  async function aislado(tabla: string, fallos: Map<string, unknown>, trabajo: () => Promise<void>) {
    try {
      await trabajo()
    } catch (e) {
      if (e instanceof Detenido || esErrorDeRed(e) || !enLinea()) throw e
      console.warn(`Sincronización de ${tabla}`, e)
      if (!fallos.has(tabla)) fallos.set(tabla, e)
    }
  }

  /** Si alguna tabla ha fallado, la vuelta acaba en error (después de hacer lo demás). */
  function lanzarSiHuboFallos(fallos: Map<string, unknown>) {
    const [primero] = fallos.values()
    if (fallos.size) throw primero
  }

  async function subir() {
    const plan = planDeSubida(await listarPendientes(base), tablas)
    await quitarSubidos(base, plan.descartar)
    const fallos = new Map<string, unknown>()
    for (const lote of plan.guardar) {
      // Si su madre no ha podido subir, la hija tampoco: el servidor la
      // rechazaría por la clave foránea y se perdería el cambio.
      const madre = definicion(lote.tabla, tablas).padre?.tabla
      if (madre && fallos.has(madre)) {
        fallos.set(lote.tabla, fallos.get(madre))
        continue
      }
      await aislado(lote.tabla, fallos, () => guardarLote(lote))
    }
    for (const lote of plan.borrar) await aislado(lote.tabla, fallos, () => borrarLote(lote))
    lanzarSiHuboFallos(fallos)
  }

  async function guardarLote({ tabla, entradas }: Lote) {
    const def = definicion(tabla, tablas)
    const filas: Record<string, unknown>[] = []
    for (const e of entradas) {
      const fila = await base.obtener<Fila>(tabla, e.id)
      if (fila) filas.push(limpiarFila(def, fila)) // si ya no existe (se borró después), no hay nada que subir
    }
    if (filas.length) {
      try {
        await remoto.guardar(tabla, filas)
      } catch (e) {
        if (!esErrorDeDatos(e)) throw e
        // El servidor rechaza alguna fila del lote: se reintenta una a una
        // para salvar las buenas y saber cuáles son las malas.
        const rechazadas: string[] = []
        for (const fila of filas) {
          try {
            await remoto.guardar(tabla, [fila])
          } catch (e2) {
            if (!esErrorDeDatos(e2)) throw e2
            console.warn(`El servidor ha rechazado una fila de ${tabla}`, e2)
            rechazadas.push(String(fila.id))
          }
        }
        comprobar()
        await deshacerRechazadas(
          tabla,
          entradas.filter((x) => rechazadas.includes(x.id)),
        )
      }
    }
    comprobar()
    await quitarSubidos(base, entradas)
  }

  /**
   * Un cambio local que el servidor no acepta se deshace: la fila vuelve a
   * estar como en el servidor (o desaparece si allí no existe). Así la copia
   * local nunca enseña algo que no está guardado de verdad. Si la fila ha
   * vuelto a cambiar mientras tanto, se deja: se intentará subir otra vez.
   */
  async function deshacerRechazadas(tabla: string, entradas: readonly EntradaCola[]) {
    if (!entradas.length) return
    const remotas = await remoto.obtener(
      tabla,
      entradas.map((e) => e.id),
    )
    comprobar()
    const porId = new Map(remotas.map((f) => [f.id, f]))
    const tocadas = await base.tx([...almacenesDeTablas, ALMACEN_COLA], 'readwrite', async (t) => {
      const afectadas = new Set<string>()
      for (const e of entradas) {
        const actual = await pedir<EntradaCola | undefined>(t.objectStore(ALMACEN_COLA).get(e.clave))
        if (!actual || actual.rev !== e.rev) continue
        const remota = porId.get(e.id)
        if (remota) {
          t.objectStore(tabla).put(remota)
          t.objectStore(ALMACEN_COLA).delete(e.clave)
          afectadas.add(tabla)
        } else {
          for (const nombre of await borrarLocal(t, tabla, e.id, tablas)) afectadas.add(nombre)
        }
        rechazados += 1
      }
      return [...afectadas]
    })
    avisarCambio(tocadas, 'remoto')
  }

  async function borrarLote({ tabla, entradas }: Lote) {
    try {
      await remoto.borrar(
        tabla,
        entradas.map((e) => e.id),
      )
    } catch (e) {
      if (!esErrorDeDatos(e)) throw e
      console.warn(`El servidor ha rechazado un borrado de ${tabla}`, e)
      comprobar()
      await deshacerBorrados(tabla, entradas)
    }
    comprobar()
    await quitarSubidos(base, entradas)
  }

  /**
   * Un borrado que el servidor no acepta se deshace: se cuenta como rechazado
   * y la tabla (con sus hijas, que aquí se borraron en cascada) se vuelve a
   * bajar entera en esta misma vuelta, así la copia local vuelve a estar
   * como el servidor.
   */
  async function deshacerBorrados(tabla: string, entradas: readonly EntradaCola[]) {
    rechazados += entradas.length
    const afectadas = new Set([tabla, ...hijasDe(tabla, tablas).map((h) => h.tabla)])
    const completas = (await base.leerMeta<string[]>('tablas_descargadas')) ?? []
    await base.guardarMeta(
      'tablas_descargadas',
      completas.filter((n) => !afectadas.has(n)),
    )
  }

  // -------------------------------------------------------------------------
  // Bajar
  // -------------------------------------------------------------------------

  async function bajar() {
    const ultima = (await base.leerMeta<string>('ultima_descarga')) ?? null
    const desde = desdeConMargen(ultima)
    let maxima = ultima
    const cambiadas = new Set<string>()

    // Una tabla que este dispositivo nunca ha bajado entera (p. ej. recién
    // añadida a tablas.ts) se baja desde el principio, aunque el resto ya
    // vaya al día: si no, sus filas antiguas no llegarían nunca.
    const completas = new Set((await base.leerMeta<string[]>('tablas_descargadas')) ?? [])

    const fallos = new Map<string, unknown>()
    for (const def of tablas) {
      const desdeTabla = completas.has(def.nombre) ? desde : null
      await aislado(def.nombre, fallos, async () => {
        for (let pos = 0; ; pos += PAGINA_DESCARGA) {
          const filas = await remoto.descargar(def.nombre, desdeTabla, pos, PAGINA_DESCARGA)
          comprobar()
          if (await aplicarRemotas(def.nombre, filas)) cambiadas.add(def.nombre)
          for (const f of filas) maxima = masReciente(maxima, f.sync_at)
          if (filas.length < PAGINA_DESCARGA) break
        }
      })
    }

    // Borrados en otros dispositivos (la primera vez no hace falta: se acaba
    // de descargar todo lo que existe)
    if (desde) {
      for (let pos = 0; ; pos += PAGINA_DESCARGA) {
        const borrados = await remoto.descargarBorrados(desde, pos, PAGINA_DESCARGA)
        comprobar()
        for (const tabla of await aplicarBorrados(borrados)) cambiadas.add(tabla)
        for (const b of borrados) maxima = masReciente(maxima, b.sync_at)
        if (borrados.length < PAGINA_DESCARGA) break
      }
    }

    await base.tx([ALMACEN_META], 'readwrite', (t) => {
      const meta = t.objectStore(ALMACEN_META)
      if (maxima && maxima !== ultima) meta.put({ clave: 'ultima_descarga', valor: maxima })
      // Una tabla que ha fallado se quita de la lista: el cursor sigue
      // adelante con las demás y ella se bajará entera la próxima vez.
      meta.put({ clave: 'tablas_descargadas', valor: tablas.map((d) => d.nombre).filter((n) => !fallos.has(n)) })
      meta.put({ clave: 'primera_descarga', valor: true })
    })
    avisarCambio([...cambiadas], 'remoto')
    lanzarSiHuboFallos(fallos)
  }

  /**
   * Guarda en la copia local las filas que llegan del servidor. La decisión y
   * la escritura van en la misma transacción, así un cambio local hecho justo
   * en ese momento no se pisa. Devuelve cuántas filas cambian.
   */
  async function aplicarRemotas(tabla: string, filas: readonly FilaRemota[]): Promise<number> {
    if (!filas.length) return 0
    return base.tx([tabla, ALMACEN_COLA], 'readwrite', async (t) => {
      const almacen = t.objectStore(tabla)
      const cola = t.objectStore(ALMACEN_COLA)
      let n = 0
      for (const remota of filas) {
        const local = await pedir<Fila | undefined>(almacen.get(remota.id))
        if (esLaMismaVersion(local, remota)) continue
        const pendiente = await pedir<EntradaCola | undefined>(cola.get(claveCola(tabla, remota.id)))
        if (decidirDescarga(local, pendiente, remota) === 'ignorar') continue
        almacen.put(remota)
        if (pendiente) cola.delete(pendiente.clave) // gana el servidor
        n += 1
      }
      return n
    })
  }

  /** Borra de la copia local lo que se ha borrado en otro dispositivo. Devuelve las tablas afectadas. */
  async function aplicarBorrados(borrados: readonly Borrado[]): Promise<string[]> {
    const validos = borrados.filter((b) => esTabla(b.tabla, tablas))
    if (!validos.length) return []
    return base.tx([...almacenesDeTablas, ALMACEN_COLA], 'readwrite', async (t) => {
      const afectadas = new Set<string>()
      for (const b of validos) {
        for (const nombre of await borrarLocal(t, b.tabla, b.fila_id, tablas)) afectadas.add(nombre)
      }
      return [...afectadas]
    })
  }

  return {
    sincronizar,
    refrescarPendientes: () => avisar(),
    detener() {
      detenido = true
    },
  }
}
