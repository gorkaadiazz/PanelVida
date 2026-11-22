// Mando del PC: lógica pura de la app (sin React ni Supabase).

export type Accion =
  | 'apagar' | 'reiniciar' | 'suspender' | 'bloquear'
  | 'volumen_subir' | 'volumen_bajar' | 'silenciar' | 'volumen'
  | 'play_pausa' | 'siguiente' | 'anterior' | 'abrir_app'

/** Nombre de cada acción para la interfaz. */
export const NOMBRE_ACCION: Record<Accion, string> = {
  apagar: 'Apagar',
  reiniciar: 'Reiniciar',
  suspender: 'Suspender',
  bloquear: 'Bloquear pantalla',
  volumen_subir: 'Subir volumen',
  volumen_bajar: 'Bajar volumen',
  silenciar: 'Silenciar',
  volumen: 'Volumen',
  play_pausa: 'Reproducir o pausar',
  siguiente: 'Siguiente',
  anterior: 'Anterior',
  abrir_app: 'Abrir',
}

/** Piden confirmación antes de mandarlas. */
export const CON_CONFIRMACION: ReadonlySet<Accion> = new Set(['apagar', 'reiniciar'])

/** Lo que dura una orden en el servidor antes de caducar. */
export const CADUCIDAD_MS = 30_000

export interface ComandoBasico {
  accion: string
  valor: string | null
  estado: string
  mensaje: string | null
  caduca_en: string
}

export type EstadoVisible = 'enviado' | 'ejecutando' | 'hecho' | 'error' | 'caducado'

/** Estado que se enseña: una orden pendiente cuyo plazo ya pasó se ve como caducada. */
export function estadoVisible(c: ComandoBasico, ahora: number): EstadoVisible {
  if (c.estado === 'pendiente') return Date.parse(c.caduca_en) <= ahora ? 'caducado' : 'enviado'
  if (c.estado === 'ejecutando' || c.estado === 'hecho' || c.estado === 'error' || c.estado === 'caducado') return c.estado
  return 'error'
}

export const TEXTO_ESTADO: Record<EstadoVisible, string> = {
  enviado: 'Enviado…',
  ejecutando: 'En marcha…',
  hecho: 'Hecho',
  error: 'Error',
  caducado: 'Caducado (el PC no respondió en 30 s)',
}

/** «Volumen al 40 %», «Abrir Firefox», «Apagar». */
export function describirComando(c: { accion: string; valor: string | null }): string {
  const nombre = Object.hasOwn(NOMBRE_ACCION, c.accion) ? (NOMBRE_ACCION as Record<string, string>)[c.accion] : c.accion
  if (c.accion === 'volumen' && c.valor) return `Volumen al ${c.valor} %`
  if (c.accion === 'abrir_app' && c.valor) return `Abrir ${c.valor}`
  return nombre
}

/** Volumen para el control deslizante: entero de 0 a 100. */
export function volumenValido(v: number): string | null {
  if (!Number.isFinite(v)) return null
  return String(Math.min(100, Math.max(0, Math.round(v))))
}
