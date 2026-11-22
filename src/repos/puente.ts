// Repositorio del Puente móvil ⇄ PC.
//
// Texto y enlaces funcionan sin conexión, como todo: se guardan en la copia
// local y suben con la cola. Los archivos necesitan conexión y van en este
// orden (ver la migración 20261122000100):
//   1. se crea la fila y se sube YA (la política de Storage solo deja subir a
//      la ruta de una fila tuya que exista en el servidor; además ahí se
//      comprueba el tope de 300 MB);
//   2. se sube el archivo a Storage;
//   3. si algo falla, se borra la fila. Si el archivo llegó a medias, la
//      limpieza de cada hora lo barre (la fila manda).

import {
  ErrorDeValidacion,
  dispositivoPorDefecto,
  limpiarNombreDispositivo,
  nombreSeguro,
  prepararTexto,
  rutaArchivo,
  validarArchivo,
} from '../lib/puente'
import { sesionGuardada } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { uuid } from '../lib/uuid'
import { sincronizarAhora } from '../sync/sesion'
import type { FilaLocal } from '../sync/tablas'
import { ErrorNoEncontrado, listar, obtener, transaccion } from './base'

export type ElementoPuente = FilaLocal<'puente'>

const BUCKET = 'puente'
const CLAVE_DISPOSITIVO = 'mipanel:dispositivo'
/** Lo que dura el enlace firmado de descarga (segundos). */
const VALIDEZ_DESCARGA_S = 60

export function listarPuente(): Promise<ElementoPuente[]> {
  return listar('puente')
}

// ---------------------------------------------------------------------------
// Nombre de este dispositivo (solo en este navegador)
// ---------------------------------------------------------------------------

const porDefecto = () => dispositivoPorDefecto(typeof navigator === 'undefined' ? '' : navigator.userAgent)

export function nombreDispositivo(): string {
  try {
    const guardado = localStorage.getItem(CLAVE_DISPOSITIVO)
    if (guardado) return limpiarNombreDispositivo(guardado, porDefecto())
  } catch {
    // Sin localStorage (modo privado estricto): el de por defecto
  }
  return porDefecto()
}

export function cambiarNombreDispositivo(nombre: string): string {
  const limpio = limpiarNombreDispositivo(nombre, porDefecto())
  try {
    localStorage.setItem(CLAVE_DISPOSITIVO, limpio)
  } catch {
    throw new ErrorDeValidacion('Este navegador no deja guardar el nombre.')
  }
  return limpio
}

// ---------------------------------------------------------------------------
// Mandar
// ---------------------------------------------------------------------------

/** Manda texto o un enlace (se decide solo). Funciona sin conexión. */
export async function enviarTexto(texto: string): Promise<ElementoPuente> {
  const { tipo, contenido } = prepararTexto(texto)
  const dispositivo = nombreDispositivo()
  return transaccion((e) =>
    e.crear('puente', {
      tipo,
      contenido,
      archivo_ruta: null,
      archivo_nombre: null,
      archivo_tipo: null,
      archivo_bytes: null,
      dispositivo,
      fijado: false,
      origen_agente: null,
    }),
  )
}

const SIN_CONEXION = 'Para mandar un archivo hace falta conexión.'

/** Manda un archivo (máximo 25 MB). Necesita conexión. */
export async function enviarArchivo(archivo: File): Promise<ElementoPuente> {
  validarArchivo(archivo)
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new ErrorDeValidacion(SIN_CONEXION)
  const usuarioId = sesionGuardada()?.user.id
  if (!usuarioId) throw new ErrorDeValidacion('Vuelve a iniciar sesión para mandar archivos.')

  const id = uuid()
  const ruta = rutaArchivo(usuarioId, id, archivo.name)
  const fila = await transaccion((e) =>
    e.crear(
      'puente',
      {
        tipo: 'archivo',
        contenido: '',
        archivo_ruta: ruta,
        archivo_nombre: nombreSeguro(archivo.name),
        archivo_tipo: (archivo.type || 'application/octet-stream').slice(0, 150),
        archivo_bytes: archivo.size,
        dispositivo: nombreDispositivo(),
        fijado: false,
        origen_agente: null,
      },
      id,
    ),
  )

  // 1. La fila tiene que estar en el servidor antes de subir el archivo
  // (se mira la fila y no el resultado: otra tabla puede fallar sin que importe aquí)
  await sincronizarAhora()
  const enServidor = (await obtener('puente', id))?.sync_at
  if (!enServidor) {
    await quitarFila(id)
    throw new ErrorDeValidacion('No se ha podido mandar el archivo: sin conexión, sin espacio en el Puente (300 MB) o con otros 3 archivos subiéndose. Inténtalo en un rato.')
  }

  // 2. El archivo
  const { error } = await supabase.storage.from(BUCKET).upload(ruta, archivo, {
    contentType: archivo.type || 'application/octet-stream',
    upsert: false,
  })
  if (error) {
    console.error('Subida al Puente', error)
    await quitarFila(id)
    throw new ErrorDeValidacion('No se ha podido subir el archivo. Inténtalo otra vez.')
  }
  return fila
}

async function quitarFila(id: string) {
  try {
    await transaccion(async (e) => {
      if (await e.obtener('puente', id)) await e.borrar('puente', id)
    })
  } catch (e) {
    console.error('No se pudo deshacer el envío', e)
  }
}

// ---------------------------------------------------------------------------
// Fijar, borrar y descargar
// ---------------------------------------------------------------------------

export async function fijarElemento(id: string, fijado: boolean): Promise<ElementoPuente> {
  return transaccion(async (e) => {
    const anterior = await e.obtener('puente', id)
    if (!anterior) throw new ErrorNoEncontrado('Eso ya no está en el Puente.')
    return e.actualizar('puente', anterior, { fijado })
  })
}

/**
 * Borra un elemento, también sin conexión. Si es un archivo, primero tiene
 * que desaparecer la fila del servidor (la política de Storage solo deja
 * borrar el archivo de una fila que ya no existe) y después se borra el
 * archivo para liberar espacio al momento. Si no se puede (sin conexión),
 * lo barre la limpieza de cada hora.
 */
export async function borrarElemento(id: string): Promise<void> {
  const elemento = await obtener('puente', id)
  await transaccion((e) => e.borrar('puente', id))
  const ruta = elemento?.archivo_ruta
  if (!ruta || (typeof navigator !== 'undefined' && !navigator.onLine)) return
  // En segundo plano: la pantalla no espera a la red
  void (async () => {
    await sincronizarAhora()
    const { error } = await supabase.storage.from(BUCKET).remove([ruta])
    if (error) console.warn('El archivo se borrará en la limpieza', error)
  })()
}

/**
 * Enlace temporal (60 s) para descargar el archivo con su nombre original.
 * El bucket es privado: sin este enlace firmado nadie puede bajarlo.
 */
export async function enlaceDescarga(elemento: ElementoPuente): Promise<string> {
  if (!elemento.archivo_ruta) throw new ErrorNoEncontrado('Este elemento no tiene archivo.')
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new ErrorDeValidacion('Para descargar hace falta conexión.')
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(elemento.archivo_ruta, VALIDEZ_DESCARGA_S, { download: elemento.archivo_nombre ?? true })
  if (error || !data?.signedUrl) {
    console.error('Descarga del Puente', error)
    throw new ErrorNoEncontrado('No se encuentra el archivo: puede que aún se esté subiendo o que ya se haya borrado.')
  }
  return data.signedUrl
}
