// Une la sincronización con la sesión y con el navegador:
//  · al iniciar sesión abre la copia local de ese usuario y arranca el motor;
//  · decide CUÁNDO se sincroniza (tras cada cambio, al volver la conexión o el
//    foco y cada minuto);
//  · al cerrar sesión lo para todo y borra la copia local.
//
// Es el único sitio de sync/ que usa window, document y navigator.

import { salir } from '../lib/auth'
import { limpiarDatosLocales } from '../lib/limpieza'
import { supabase } from '../lib/supabase'
import { alCambioLocal, avisarTodo, ponerEstado, reiniciarEstado } from './avisos'
import { abrirBase, usarBase, type BaseLocal } from './bd'
import { contarPendientes } from './cola'
import { crearMotor, type Motor } from './motor'
import { TABLAS_EN_TIEMPO_REAL, crearRemotoSupabase, escucharCambios } from './remoto'
import { olvidarEsteDispositivo } from '../repos/recordatorios'

/** Los cambios seguidos se agrupan: se suben al poco de dejar de tocar. */
const ESPERA_TRAS_CAMBIO_MS = 1500
const INTERVALO_MS = 60_000
/** Varios avisos de tiempo real seguidos se juntan en una sola sincronización. */
const ESPERA_TIEMPO_REAL_MS = 300
/** Al cerrar sesión, lo que se espera como mucho al último intento de subir cambios. */
const ESPERA_ULTIMA_SUBIDA_MS = 5000

const MENSAJE_SIN_COPIA_LOCAL = 'Este navegador no deja guardar datos en el dispositivo. Prueba fuera del modo privado.'

interface SesionSync {
  usuarioId: string
  base: Promise<BaseLocal>
  motor: Motor | null
  /** Deja de escuchar al navegador y para los temporizadores. */
  soltar: () => void
}

let actual: SesionSync | null = null

const enLinea = () => typeof navigator === 'undefined' || navigator.onLine

/**
 * Empieza a sincronizar para este usuario. Se puede llamar varias veces: con
 * el mismo usuario no hace nada. Deja lista la copia local al momento (los
 * repositorios ya pueden leer); el motor arranca justo después.
 *
 * No llama a Supabase de forma síncrona: se puede usar dentro del callback
 * de onAuthStateChange.
 */
export function iniciarSync(usuarioId: string): void {
  if (actual?.usuarioId === usuarioId) return
  if (actual) parar() // otra cuenta: abrirBase vaciará lo que hubiera de la anterior

  const base = abrirBase(usuarioId)
  usarBase(base)
  const sesion: SesionSync = { usuarioId, base, motor: null, soltar: () => {} }
  actual = sesion
  avisarTodo()

  base.then(
    (abierta) => {
      if (actual !== sesion) return abierta.cerrar()
      arrancarMotor(sesion, abierta)
    },
    (error: unknown) => {
      console.error('No se pudo abrir la copia local', error)
      if (actual === sesion) ponerEstado({ fase: 'error', error: MENSAJE_SIN_COPIA_LOCAL })
    },
  )
}

function arrancarMotor(sesion: SesionSync, base: BaseLocal) {
  const motor = crearMotor({ base, remoto: crearRemotoSupabase(supabase), enLinea })
  sesion.motor = motor

  let temporizador: ReturnType<typeof setTimeout> | undefined
  const programar = (ms: number) => {
    clearTimeout(temporizador)
    temporizador = setTimeout(() => void motor.sincronizar(), ms)
  }

  const alVolverLaRed = () => programar(0)
  const alPerderLaRed = () => ponerEstado({ fase: 'sin-conexion', error: null })
  const alVolverALaApp = () => {
    if (document.visibilityState === 'visible') programar(0)
  }
  const dejarDeEscucharCambios = alCambioLocal(() => {
    void motor.refrescarPendientes()
    programar(ESPERA_TRAS_CAMBIO_MS)
  })
  window.addEventListener('online', alVolverLaRed)
  window.addEventListener('offline', alPerderLaRed)
  window.addEventListener('focus', alVolverALaApp)
  document.addEventListener('visibilitychange', alVolverALaApp)
  const intervalo = setInterval(alVolverALaApp, INTERVALO_MS)
  // Tiempo real (Puente…): cada aviso solo lanza una sincronización enseguida.
  let dejarDeEscucharRemoto = () => {}
  try {
    dejarDeEscucharRemoto = escucharCambios(supabase, sesion.usuarioId, TABLAS_EN_TIEMPO_REAL, () => programar(ESPERA_TIEMPO_REAL_MS))
  } catch (error) {
    console.warn('Sin tiempo real', error)
  }

  sesion.soltar = () => {
    clearTimeout(temporizador)
    clearInterval(intervalo)
    dejarDeEscucharCambios()
    dejarDeEscucharRemoto()
    window.removeEventListener('online', alVolverLaRed)
    window.removeEventListener('offline', alPerderLaRed)
    window.removeEventListener('focus', alVolverALaApp)
    document.removeEventListener('visibilitychange', alVolverALaApp)
  }

  void motor.refrescarPendientes()
  // En una tarea aparte: la primera vuelta llama a Supabase y esto puede
  // estar ejecutándose dentro del callback de onAuthStateChange.
  programar(0)
}

/** Para el motor y cierra la copia local (sin borrarla). */
function parar() {
  const sesion = actual
  actual = null
  usarBase(null)
  if (!sesion) return
  sesion.motor?.detener()
  sesion.soltar()
  sesion.base.then(
    (base) => base.cerrar(),
    () => {},
  )
}

/**
 * Para la sincronización y BORRA la copia local (datos, cola y meta). Se
 * llama al cerrar sesión y cuando la app arranca sin sesión. No lanza.
 */
export async function detenerSync(): Promise<void> {
  const sesion = actual
  parar()
  reiniciarEstado()
  // Se espera a que la conexión esté cerrada para que el borrado no se bloquee
  await sesion?.base.catch(() => {})
  await limpiarDatosLocales()
  avisarTodo()
}

/** Lanza una sincronización ya (p. ej. un botón "Reintentar"). Resuelve true si ha ido bien. */
export function sincronizarAhora(): Promise<boolean> {
  return actual?.motor?.sincronizar() ?? Promise.resolve(false)
}

/** Cambios hechos en este dispositivo que aún no se han subido. */
export async function cambiosSinSubir(): Promise<number> {
  if (!actual) return 0
  try {
    return await contarPendientes(await actual.base)
  } catch {
    return 0
  }
}

export interface ResultadoCierre {
  /** Cambios que no se pudieron subir antes de cerrar y se han perdido. */
  cambiosPerdidos: number
}

/**
 * Cierra la sesión en este dispositivo. NUNCA lanza y funciona sin conexión:
 * la sesión y la copia local se borran siempre (es lo que protege los datos
 * en un PC compartido).
 *
 * Antes de borrar intenta subir los cambios pendientes (unos segundos como
 * mucho). Los que no se puedan subir SE PIERDEN: la pantalla debe avisar
 * antes con `cambiosSinSubir()` o `useEstadoSync().pendientes`.
 */
export async function cerrarSesion(): Promise<ResultadoCierre> {
  let cambiosPerdidos = 0
  try {
    cambiosPerdidos = await cambiosSinSubir()
    const motor = actual?.motor
    if (cambiosPerdidos > 0 && motor && enLinea()) {
      await Promise.race([motor.sincronizar(), new Promise((ok) => setTimeout(ok, ESPERA_ULTIMA_SUBIDA_MS))])
      cambiosPerdidos = await cambiosSinSubir()
    }
  } catch (error) {
    console.error('No se pudieron subir los últimos cambios', error)
  }
  // Este navegador deja de recibir los recordatorios de esta cuenta
  await olvidarEsteDispositivo()
  // Primero los datos (no dependen de la red) y después la sesión.
  await detenerSync()
  await salir()
  return { cambiosPerdidos }
}
