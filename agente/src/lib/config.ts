// Agente del PC · configuración y credenciales (lógica pura: validar y leer).
//
// Dos archivos en ~/.config/mipanel/ (carpeta 700, archivos 600):
//   · credenciales.json: el usuario del agente (lo escribe `vincular`).
//   · config.json: lo que configuras tú (dirección de Supabase, apps que se
//     pueden abrir, MAC del router de casa).
// Lo que no valide se ignora: el agente nunca usa un valor raro.

export interface Credenciales {
  supabaseUrl: string
  anonKey: string
  email: string
  password: string
  agenteId: string
  nombre: string
}

export interface App {
  /** Nombre que se ve en la app (y que llega en los comandos). */
  nombre: string
  /** Programa y argumentos, sin shell: ["firefox"], ["steam"], ["dolphin"]. */
  orden: string[]
}

export interface Config {
  supabaseUrl: string
  apps: App[]
  /** MAC del router de casa (para el vigilante de la red). */
  macRouter: string | null
}

export const URL_POR_DEFECTO = 'https://pmcacougksqimitapiqr.supabase.co'

const esTexto = (v: unknown): v is string => typeof v === 'string'

export function esUrlSupabase(url: unknown): url is string {
  return esTexto(url) && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)
}

export function normalizarMac(mac: unknown): string | null {
  if (!esTexto(mac)) return null
  const limpio = mac.trim().toLowerCase().replace(/-/g, ':')
  return /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(limpio) ? limpio : null
}

/** Lee config.json (ya parseado). Lo que no valga se cambia por el valor por defecto. */
export function leerConfig(json: unknown): { config: Config; avisos: string[] } {
  const avisos: string[] = []
  const datos = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  let supabaseUrl = URL_POR_DEFECTO
  if (datos.supabaseUrl !== undefined) {
    if (esUrlSupabase(datos.supabaseUrl)) supabaseUrl = datos.supabaseUrl
    else avisos.push('supabaseUrl no es una dirección de Supabase: se usa la de siempre')
  }
  const apps: App[] = []
  const vistas = new Set<string>()
  if (datos.apps !== undefined) {
    if (typeof datos.apps !== 'object' || datos.apps === null || Array.isArray(datos.apps)) {
      avisos.push('apps tiene que ser un objeto: { "Firefox": ["firefox"] }')
    } else {
      for (const [nombre, orden] of Object.entries(datos.apps)) {
        const limpio = nombre.replace(/\s+/g, ' ').trim()
        const valida =
          limpio.length >= 1 &&
          limpio.length <= 40 &&
          !/[\p{Cc}]/u.test(limpio) &&
          Array.isArray(orden) &&
          orden.length >= 1 &&
          orden.length <= 10 &&
          orden.every((p) => esTexto(p) && p.length >= 1 && p.length <= 200 && !p.includes('\0'))
        if (!valida) {
          avisos.push(`La app «${limpio || '(sin nombre)'}» no es válida: se ignora`)
          continue
        }
        if (vistas.has(limpio.toLowerCase())) {
          avisos.push(`La app «${limpio}» está repetida: se usa la primera`)
          continue
        }
        if (apps.length >= 30) {
          avisos.push('Como mucho 30 apps')
          break
        }
        vistas.add(limpio.toLowerCase())
        apps.push({ nombre: limpio, orden: orden as string[] })
      }
    }
  }
  let macRouter: string | null = null
  if (datos.macRouter !== undefined && datos.macRouter !== null) {
    macRouter = normalizarMac(datos.macRouter)
    if (!macRouter) avisos.push('macRouter no es una MAC (aa:bb:cc:dd:ee:ff): el vigilante de la red no escaneará')
  }
  return { config: { supabaseUrl, apps, macRouter }, avisos }
}

/** Lee credenciales.json (ya parseado). null si falta algo: hay que volver a vincular. */
export function leerCredenciales(json: unknown): Credenciales | null {
  if (typeof json !== 'object' || json === null) return null
  const d = json as Record<string, unknown>
  if (!esUrlSupabase(d.supabaseUrl) || !esTexto(d.anonKey) || !esTexto(d.email) || !esTexto(d.password) || !esTexto(d.agenteId) || !esTexto(d.nombre)) return null
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(d.agenteId) || d.password.length < 20 || !d.email.endsWith('@agente.invalid')) return null
  return { supabaseUrl: d.supabaseUrl, anonKey: d.anonKey, email: d.email, password: d.password, agenteId: d.agenteId, nombre: d.nombre }
}

/** El código de vincular como lo comprueba el servidor: 8 caracteres sin I, O, 0 ni 1. */
export function normalizarCodigoVincular(codigo: string): string | null {
  const n = codigo.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  return /^[A-HJ-NP-Z2-9]{8}$/.test(n) ? n : null
}

/** ¿Los permisos de un archivo de credenciales son seguros? (solo el dueño: 600 o 400) */
export function permisosSeguros(modo: number): boolean {
  return (modo & 0o077) === 0
}
