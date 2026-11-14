// Recordatorios (notificaciones Web Push): lo que no depende del navegador.

/**
 * Clave pública VAPID del servidor (la escribe scripts/claves-recordatorios.mjs).
 * Es pública: el navegador la necesita para suscribirse. La privada solo está
 * en los secretos de Supabase. Vacía = recordatorios sin configurar.
 */
export const CLAVE_PUBLICA_VAPID = 'BKC1SjVzO7t_2lW17ftdLw7sPUaSDXcDj7rkSqW39lAwSlcSAK4d9t8xYrCenbcoBHP9dse3e-kEuEpWQpmB1-A'

/** Hora por defecto del aviso (en Madrid). */
export const HORA_POR_DEFECTO = 20

/** Horas que se pueden elegir: de 7:00 a 23:00. */
export const HORAS = Array.from({ length: 17 }, (_, i) => i + 7)

export function textoHora(hora: number): string {
  return `${String(hora).padStart(2, '0')}:00`
}

export function esHora(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 0 && valor <= 23
}

/** base64url → bytes (para applicationServerKey). */
export function deBase64url(valor: string): Uint8Array<ArrayBuffer> {
  const limpio = valor.replace(/-/g, '+').replace(/_/g, '/')
  const binario = atob(limpio + '='.repeat((4 - (limpio.length % 4)) % 4))
  return Uint8Array.from(binario, (c) => c.charCodeAt(0))
}
