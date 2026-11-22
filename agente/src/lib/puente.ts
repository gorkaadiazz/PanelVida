// Agente del PC · qué hacer cuando llega algo al Puente (lógica pura).
//
// REGLA DE ORO: lo que llega de la base de datos es TEXTO, nunca una orden.
// Aquí solo se decide si se avisa y si se copia; quien lo hace (escritorio.ts)
// usa execFile con argumentos fijos y el texto por la entrada estándar, nunca
// una shell.

export interface ElementoPuente {
  id: string
  tipo: string
  contenido: string
  archivo_nombre: string | null
  dispositivo: string
}

export interface Reaccion {
  /** Título y cuerpo de la notificación (ya escapados), o null si no se avisa. */
  aviso: { titulo: string; cuerpo: string } | null
  /** Texto para el portapapeles, o null si no se copia (archivos). */
  copiar: string | null
}

export const MAX_COPIAR = 10000
const MAX_CUERPO = 200

/**
 * Las notificaciones de KDE interpretan un poco de HTML en el cuerpo
 * (<b>, <a href>…). Se escapa todo para que un texto del Puente no pueda
 * meter enlaces ni formato en la notificación.
 */
export function escaparNotificacion(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** Recorta sin partir un emoji y quita caracteres de control (salvo saltos de línea). */
export function recortar(texto: string, max: number): string {
  // Quitar caracteres de control (salvo el salto de línea): a propósito
  // oxlint-disable-next-line no-control-regex
  const limpio = texto.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
  const letras = [...limpio]
  return letras.length <= max ? limpio : `${letras.slice(0, max - 1).join('').trimEnd()}…`
}

export function reaccionar(e: ElementoPuente, nombreDeEstePC: string): Reaccion {
  // Lo que manda este mismo PC (mipanel-enviar) no se avisa ni se copia otra vez
  if (e.dispositivo.trim() && e.dispositivo.trim() === nombreDeEstePC.trim()) return { aviso: null, copiar: null }
  const origen = e.dispositivo.trim() || 'otro dispositivo'
  if (e.tipo === 'archivo') {
    return {
      aviso: { titulo: `Puente · ${escaparNotificacion(recortar(origen, 40))}`, cuerpo: escaparNotificacion(`Archivo: ${recortar(e.archivo_nombre ?? 'sin nombre', 120)} (descárgalo en Mi Panel)`) },
      copiar: null,
    }
  }
  if (e.tipo !== 'texto' && e.tipo !== 'enlace') return { aviso: null, copiar: null }
  const copiar = e.contenido.length <= MAX_COPIAR ? e.contenido : null
  const resumen = recortar(e.contenido.split('\n').find((l) => l.trim()) ?? '', MAX_CUERPO)
  return {
    aviso: {
      titulo: `Puente · ${escaparNotificacion(recortar(origen, 40))}`,
      cuerpo: escaparNotificacion(copiar !== null ? `${resumen}\n(copiado al portapapeles)` : resumen),
    },
    copiar,
  }
}

/** Lo que manda `mipanel-enviar`: el portapapeles, sin espacios de los extremos. null si no hay nada válido. */
export function prepararEnvio(portapapeles: string): string | null {
  const texto = portapapeles.replace(/^\s+|\s+$/g, '')
  if (!texto) return null
  if (texto.length > MAX_COPIAR) return null
  return texto
}
