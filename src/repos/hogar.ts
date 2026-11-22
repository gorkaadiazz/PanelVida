// Repositorio del hogar (Lista de casa): crear el hogar, invitar, unirse,
// ver miembros, expulsar y salir. Necesita conexión (son decisiones que
// tienen que verse al momento en el servidor). Lo último que se sabe se
// guarda en la copia local (IndexedDB, se borra al cerrar sesión) para poder
// enseñar los nombres de los miembros sin conexión.

import { esResultadoUnirse, normalizarCodigo, type Miembro, type ResultadoUnirse } from '../lib/hogar'
import { ErrorDeValidacion } from '../lib/validacion'
import { sesionGuardada } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { avisarCambio } from '../sync/avisos'
import { baseActual } from '../sync/bd'
import { sincronizarAhora } from '../sync/sesion'

export interface Hogar {
  id: string
  nombre: string
  duenoId: string
  miembros: Miembro[]
}

export interface Invitacion {
  id: string
  caduca_en: string
  usado_en: string | null
}

const META = 'hogar'
/** Nombre del «almacén» con el que se avisa a los hooks de que el hogar ha cambiado. */
export const CAMBIO_HOGAR = 'hogar'

const SIN_CONEXION = 'Para esto hace falta conexión.'

function comprobarConexion() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new ErrorDeValidacion(SIN_CONEXION)
}

function yo(): string {
  const id = sesionGuardada()?.user.id
  if (!id) throw new ErrorDeValidacion('Vuelve a iniciar sesión.')
  return id
}

/** Lo último que se sabe del hogar en este dispositivo (undefined: nunca se ha preguntado). */
export async function hogarGuardado(): Promise<Hogar | null | undefined> {
  return (await baseActual()).leerMeta<Hogar | null>(META)
}

async function guardar(hogar: Hogar | null) {
  await (await baseActual()).guardarMeta(META, hogar)
  avisarCambio([CAMBIO_HOGAR], 'remoto')
}

/** Pregunta al servidor en qué hogar estás y quién más hay. Sin conexión, lo guardado. */
export async function consultarHogar(): Promise<Hogar | null | undefined> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return hogarGuardado()
  const usuario = yo()
  const { data: mia, error } = await supabase.from('hogar_miembros').select('hogar_id').eq('user_id', usuario).maybeSingle()
  if (error) {
    console.warn('Hogar', error)
    return hogarGuardado()
  }
  if (!mia) {
    await guardar(null)
    return null
  }
  const [hogar, miembros] = await Promise.all([
    supabase.from('hogares').select('id, nombre, user_id').eq('id', mia.hogar_id).maybeSingle(),
    supabase.from('hogar_miembros').select('user_id, nombre').eq('hogar_id', mia.hogar_id),
  ])
  if (hogar.error || miembros.error || !hogar.data) {
    console.warn('Hogar', hogar.error ?? miembros.error)
    return hogarGuardado()
  }
  const resultado: Hogar = { id: hogar.data.id, nombre: hogar.data.nombre, duenoId: hogar.data.user_id, miembros: miembros.data ?? [] }
  await guardar(resultado)
  return resultado
}

/** Después de entrar o salir de un hogar, la Lista de casa se vuelve a bajar entera. */
async function despuesDeCambiarDeHogar() {
  await consultarHogar()
  void sincronizarAhora()
}

export async function crearHogar(nombre: string): Promise<void> {
  comprobarConexion()
  const limpio = nombre.replace(/\s+/g, ' ').trim() || 'Casa'
  if (limpio.length > 60) throw new ErrorDeValidacion('El nombre puede tener como mucho 60 caracteres.')
  // Sin pedir la fila de vuelta: la política de lectura pide ser miembro, y el
  // dueño entra como miembro justo después (trigger).
  const { error } = await supabase.from('hogares').insert({ nombre: limpio })
  if (error) {
    console.error('Crear hogar', error)
    throw new ErrorDeValidacion('No se ha podido crear el hogar. ¿Ya estás en uno?')
  }
  await despuesDeCambiarDeHogar()
}

export async function renombrarHogar(id: string, nombre: string): Promise<void> {
  comprobarConexion()
  const limpio = nombre.replace(/\s+/g, ' ').trim()
  if (!limpio || limpio.length > 60) throw new ErrorDeValidacion('Escribe un nombre de hasta 60 caracteres.')
  const { error } = await supabase.from('hogares').update({ nombre: limpio }).eq('id', id)
  if (error) throw new ErrorDeValidacion('No se ha podido cambiar el nombre.')
  await consultarHogar()
}

/** Crea una invitación y devuelve el código (solo se ve esta vez). */
export async function crearInvitacion(): Promise<{ codigo: string; caduca_en: string }> {
  comprobarConexion()
  const { data, error } = await supabase.rpc('crear_invitacion')
  const fila = Array.isArray(data) ? data[0] : data
  if (error || !fila?.codigo) {
    console.error('Invitación', error)
    throw new ErrorDeValidacion(error?.message?.includes('5 invitaciones') ? 'Ya tienes 5 invitaciones sin usar: anula alguna.' : 'No se ha podido crear la invitación.')
  }
  return { codigo: fila.codigo, caduca_en: fila.caduca_en }
}

export async function listarInvitaciones(): Promise<Invitacion[]> {
  comprobarConexion()
  const { data, error } = await supabase
    .from('hogar_invitaciones')
    .select('id, caduca_en, usado_en')
    .is('usado_en', null)
    .gt('caduca_en', new Date().toISOString())
    .order('created_at', { ascending: false })
  if (error) throw new ErrorDeValidacion('No se han podido leer las invitaciones.')
  return data ?? []
}

export async function anularInvitacion(id: string): Promise<void> {
  comprobarConexion()
  const { error } = await supabase.from('hogar_invitaciones').delete().eq('id', id)
  if (error) throw new ErrorDeValidacion('No se ha podido anular la invitación.')
}

/** Entra en un hogar con un código. Devuelve el resultado del servidor. */
export async function unirseConCodigo(codigo: string): Promise<ResultadoUnirse> {
  comprobarConexion()
  const { data, error } = await supabase.rpc('unirse_hogar', { codigo: normalizarCodigo(codigo) })
  if (error || !esResultadoUnirse(data)) {
    console.error('Unirse', error)
    throw new ErrorDeValidacion('No se ha podido comprobar el código. Inténtalo otra vez.')
  }
  if (data === 'ok') await despuesDeCambiarDeHogar()
  return data
}

/** El dueño expulsa a alguien: deja de ver la Lista de casa al momento. */
export async function expulsar(hogarId: string, userId: string): Promise<void> {
  comprobarConexion()
  const { error, count } = await supabase.from('hogar_miembros').delete({ count: 'exact' }).eq('hogar_id', hogarId).eq('user_id', userId)
  if (error || count === 0) throw new ErrorDeValidacion('No se ha podido expulsar.')
  await consultarHogar()
}

/** Un miembro sale del hogar (el dueño, en cambio, lo borra). */
export async function salirDelHogar(hogarId: string): Promise<void> {
  comprobarConexion()
  const { error, count } = await supabase.from('hogar_miembros').delete({ count: 'exact' }).eq('hogar_id', hogarId).eq('user_id', yo())
  if (error || count === 0) throw new ErrorDeValidacion('No se ha podido salir del hogar.')
  await despuesDeCambiarDeHogar()
}

/** El dueño borra el hogar: todos salen y la Lista de casa se borra. */
export async function borrarHogar(hogarId: string): Promise<void> {
  comprobarConexion()
  const { error, count } = await supabase.from('hogares').delete({ count: 'exact' }).eq('id', hogarId)
  if (error || count === 0) throw new ErrorDeValidacion('No se ha podido borrar el hogar.')
  await despuesDeCambiarDeHogar()
}
