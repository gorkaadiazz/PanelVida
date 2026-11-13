// Qué mensaje se enseña cuando falla una acción de una pantalla.
// Los errores pensados para el usuario (validación, "ya no existe") se
// enseñan tal cual; el resto se resume en un texto genérico, sin detalles
// internos (nombres de tablas, trazas, mensajes de IndexedDB…).

export const MENSAJE_GENERICO = 'No se ha podido guardar el cambio. Inténtalo otra vez.'

/** Nombres de los errores cuyo mensaje está escrito para el usuario. */
const PARA_EL_USUARIO = new Set(['ErrorDeValidacion', 'ErrorNoEncontrado'])

export function mensajeDeError(e: unknown): string {
  if (e instanceof Error && PARA_EL_USUARIO.has(e.name) && e.message) return e.message
  return MENSAJE_GENERICO
}
