// Hogar e invitaciones: lógica pura (sin React ni Supabase).

import { diaEnMadrid, diferenciaDias } from './fechas'

export type ResultadoUnirse = 'ok' | 'invalido' | 'caducado' | 'usado' | 'ya_en_hogar' | 'demasiados_intentos'

const MENSAJES: Record<Exclude<ResultadoUnirse, 'ok'>, string> = {
  invalido: 'Ese código no existe. Revisa que esté bien escrito.',
  caducado: 'Ese código ha caducado (duran 7 días). Pide uno nuevo.',
  usado: 'Ese código ya se ha usado (sirven una sola vez). Pide uno nuevo.',
  ya_en_hogar: 'Ya estás en un hogar. Para entrar en otro, sal primero del tuyo.',
  demasiados_intentos: 'Demasiados intentos fallidos. Espera una hora y vuelve a probar.',
}

export function esResultadoUnirse(valor: unknown): valor is ResultadoUnirse {
  return valor === 'ok' || (typeof valor === 'string' && Object.hasOwn(MENSAJES, valor))
}

/** Mensaje para el usuario de un intento fallido (null si ha ido bien). */
export function mensajeUnirse(resultado: ResultadoUnirse): string | null {
  return resultado === 'ok' ? null : MENSAJES[resultado]
}

/** El código como lo comprueba el servidor: sin guiones ni espacios y en mayúsculas. */
export function normalizarCodigo(codigo: string): string {
  return codigo.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

/** ¿Tiene pinta de código? (10 caracteres del alfabeto: sin I, O, 0 ni 1). */
export function pareceCodigo(codigo: string): boolean {
  return /^[A-HJ-NP-Z2-9]{10}$/.test(normalizarCodigo(codigo))
}

/** «ABCDE-FGHJK» mientras se escribe. */
export function formatearCodigo(codigo: string): string {
  const n = normalizarCodigo(codigo).slice(0, 10)
  return n.length > 5 ? `${n.slice(0, 5)}-${n.slice(5)}` : n
}

/** «Caduca hoy», «Caduca mañana», «Caduca en 6 días» o «Caducado». */
export function textoCaducaInvitacion(caducaEn: string, ahora: number): string {
  const ms = Date.parse(caducaEn) - ahora
  if (Number.isNaN(ms)) return ''
  if (ms <= 0) return 'Caducado'
  // Días de calendario en Madrid (no tramos de 24 h): a las 23:30, lo que
  // caduca mañana a las 11:00 caduca «mañana», no «hoy».
  const dias = diferenciaDias(diaEnMadrid(ahora), diaEnMadrid(caducaEn))
  if (dias === 0) return 'Caduca hoy'
  if (dias === 1) return 'Caduca mañana'
  return `Caduca en ${dias} días`
}

export interface Miembro {
  user_id: string
  nombre: string
}

/** Miembros con el dueño primero y el resto por nombre. */
export function ordenarMiembros<M extends Miembro>(miembros: readonly M[], duenoId: string): M[] {
  return [...miembros].sort((a, b) => (a.user_id === duenoId ? -1 : b.user_id === duenoId ? 1 : a.nombre.localeCompare(b.nombre, 'es')))
}

/** Nombre de quien marcó algo: «tú», su nombre o «alguien que ya no está en el hogar». */
export function nombreDeMiembro(userId: string | null, miembros: readonly Miembro[], yo: string): string | null {
  if (!userId) return null
  if (userId === yo) return 'ti'
  return miembros.find((m) => m.user_id === userId)?.nombre ?? 'alguien que ya no está en el hogar'
}
