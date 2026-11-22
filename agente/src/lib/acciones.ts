// Agente del PC · la LISTA FIJA de lo que se puede hacer (lógica pura).
//
// De la base de datos solo llega el NOMBRE de una acción (y, para el volumen
// o abrir una app, un número o el nombre de una app). Aquí se traduce a un
// programa y sus argumentos, escritos en este archivo o en TU config.json.
// Nada de lo que llega se ejecuta tal cual: si no está en la lista, no se hace.
//
// KDE Plasma con PipeWire:
//   volumen     → wpctl (wireplumber)
//   multimedia  → playerctl
//   bloquear    → loginctl lock-session <tu sesión gráfica>
//   apagar…     → systemctl poweroff | reboot | suspend (polkit lo permite a la sesión activa)

import type { App } from './config.ts'

export interface Orden {
  programa: string
  args: string[]
  /** Desvincular el proceso (apps que se quedan abiertas). */
  separado?: boolean
}

export type Accion =
  | 'apagar' | 'reiniciar' | 'suspender' | 'bloquear'
  | 'volumen_subir' | 'volumen_bajar' | 'silenciar' | 'volumen'
  | 'play_pausa' | 'siguiente' | 'anterior' | 'abrir_app'

const SALIDA = '@DEFAULT_AUDIO_SINK@'

const FIJAS: Record<Exclude<Accion, 'volumen' | 'abrir_app' | 'bloquear'>, Orden> = {
  apagar: { programa: 'systemctl', args: ['poweroff'] },
  reiniciar: { programa: 'systemctl', args: ['reboot'] },
  suspender: { programa: 'systemctl', args: ['suspend'] },
  volumen_subir: { programa: 'wpctl', args: ['set-volume', '-l', '1.0', SALIDA, '5%+'] },
  volumen_bajar: { programa: 'wpctl', args: ['set-volume', SALIDA, '5%-'] },
  silenciar: { programa: 'wpctl', args: ['set-mute', SALIDA, 'toggle'] },
  play_pausa: { programa: 'playerctl', args: ['play-pause'] },
  siguiente: { programa: 'playerctl', args: ['next'] },
  anterior: { programa: 'playerctl', args: ['previous'] },
}

/** Las que apagan o duermen el PC: el resultado se cuenta ANTES (después ya no se puede). */
export const ACCIONES_SIN_VUELTA: ReadonlySet<string> = new Set(['apagar', 'reiniciar', 'suspender'])

export function esAccion(valor: unknown): valor is Accion {
  return typeof valor === 'string' && (Object.hasOwn(FIJAS, valor) || valor === 'volumen' || valor === 'abrir_app' || valor === 'bloquear')
}

/**
 * Traduce una orden de la base de datos a lo que se ejecuta. null si no vale
 * (acción desconocida, volumen raro o app que no está en tu config.json).
 * `sesion` es el id de tu sesión gráfica (para bloquear la pantalla).
 */
export function traducir(accion: unknown, valor: unknown, apps: readonly App[], sesion: string | null): Orden | null {
  if (!esAccion(accion)) return null
  if (accion === 'volumen') {
    if (typeof valor !== 'string' || !/^(100|[1-9]?[0-9])$/.test(valor)) return null
    return { programa: 'wpctl', args: ['set-volume', SALIDA, `${valor}%`] }
  }
  if (accion === 'abrir_app') {
    const app = apps.find((a) => a.nombre === valor)
    if (!app) return null
    return { programa: app.orden[0], args: app.orden.slice(1), separado: true }
  }
  if (accion === 'bloquear') {
    if (!sesion || !/^[A-Za-z0-9_-]{1,32}$/.test(sesion)) return null
    return { programa: 'loginctl', args: ['lock-session', sesion] }
  }
  if (valor !== null && valor !== undefined) return null
  // Una copia: quien la reciba no puede cambiar la lista fija
  const fija = FIJAS[accion]
  return { programa: fija.programa, args: [...fija.args] }
}

/** Lee la salida de `wpctl get-volume @DEFAULT_AUDIO_SINK@`: «Volume: 0.45 [MUTED]». */
export function leerVolumen(salida: string): { volumen: number; silenciado: boolean } | null {
  const m = /Volume:\s*([0-9]+(?:\.[0-9]+)?)/.exec(salida)
  if (!m) return null
  const volumen = Math.round(Number(m[1]) * 100)
  if (!Number.isFinite(volumen) || volumen < 0 || volumen > 150) return null
  return { volumen, silenciado: /\[MUTED\]/.test(salida) }
}

/** Mensaje corto para la app a partir de un error (sin rutas ni datos de más). */
export function mensajeError(e: unknown): string {
  const err = e as { code?: string; message?: string }
  if (err?.code === 'ENOENT') return 'Falta un programa en el PC (mira docs/AGENTE.md)'
  if (err?.code === 'ETIMEDOUT' || /timed out/i.test(err?.message ?? '')) return 'El PC no ha respondido a tiempo'
  const texto = String(err?.message ?? 'Error').split('\n')[0]
  return texto.replace(/\/home\/[^/\s]+/g, '~').slice(0, 150)
}
