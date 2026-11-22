// Agente del PC · vigilante de la red de casa (lógica pura).
//
// Cómo se escanea SIN privilegios (ni root ni setcap):
//   1. Se manda un paquete UDP vacío a cada IP de tu red (/24). Para
//      enviarlo, el kernel tiene que preguntar por ARP «¿quién tiene esta
//      IP?», y los aparatos encendidos contestan con su MAC (aunque ignoren
//      el ping).
//   2. Se lee la tabla de vecinos del kernel (`ip -j neigh`), que ya tiene la
//      IP y la MAC de cada uno que ha contestado.
// Solo se escanea si el PC está en TU red de casa: la MAC del router (puerta
// de enlace) tiene que ser la de config.json.

export interface Vecino {
  ip: string
  mac: string
}

const ESTADOS_VALIDOS = new Set(['REACHABLE', 'STALE', 'DELAY', 'PROBE', 'PERMANENT', 'NOARP'])
// Sin ceros delante («01»): hay programas que los leen en octal
const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/

export function esIPv4(ip: unknown): ip is string {
  return typeof ip === 'string' && IPV4.test(ip)
}

export function normalizarMacVecino(mac: unknown): string | null {
  if (typeof mac !== 'string') return null
  const m = mac.trim().toLowerCase()
  if (!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(m)) return null
  // Ni todo ceros, ni difusión/multicast (bit más bajo del primer byte a 1)
  if (m === '00:00:00:00:00:00' || parseInt(m.slice(0, 2), 16) & 1) return null
  return m
}

/** MAC «administrada localmente» (segundo bit del primer byte): casi siempre una MAC aleatoria de un móvil. */
export function esMacAleatoria(mac: string): boolean {
  return (parseInt(mac.slice(0, 2), 16) & 2) === 2
}

function json(texto: string): unknown {
  try {
    return JSON.parse(texto)
  } catch {
    return null
  }
}

/** `ip -j neigh show dev X` → vecinos IPv4 con MAC que han contestado. */
export function leerVecinos(salida: string): Vecino[] {
  const datos = json(salida)
  if (!Array.isArray(datos)) return []
  const vistos = new Map<string, Vecino>()
  for (const v of datos) {
    if (typeof v !== 'object' || v === null) continue
    const { dst, lladdr, state } = v as Record<string, unknown>
    const estados = Array.isArray(state) ? state : []
    if (!esIPv4(dst) || !estados.some((s) => ESTADOS_VALIDOS.has(String(s)))) continue
    const mac = normalizarMacVecino(lladdr)
    if (mac && !vistos.has(mac)) vistos.set(mac, { ip: dst, mac })
  }
  return [...vistos.values()]
}

/** `ip -j route show default` → la puerta de enlace (router) y la interfaz. */
export function leerRutaPorDefecto(salida: string): { ip: string; dev: string } | null {
  const datos = json(salida)
  if (!Array.isArray(datos)) return null
  for (const r of datos) {
    const { gateway, dev } = (r ?? {}) as Record<string, unknown>
    if (esIPv4(gateway) && typeof dev === 'string' && /^[A-Za-z0-9._-]{1,15}$/.test(dev)) return { ip: gateway, dev }
  }
  return null
}

/** `ip -j -4 addr show dev X` → tu IP y el prefijo (/24…). */
export function leerDireccion(salida: string): { ip: string; prefijo: number } | null {
  const datos = json(salida)
  if (!Array.isArray(datos)) return null
  for (const i of datos) {
    const info = (i as { addr_info?: unknown })?.addr_info
    if (!Array.isArray(info)) continue
    for (const a of info) {
      const { family, local, prefixlen } = (a ?? {}) as Record<string, unknown>
      if (family === 'inet' && esIPv4(local) && Number.isInteger(prefixlen) && (prefixlen as number) >= 8 && (prefixlen as number) <= 32) return { ip: local, prefijo: prefixlen as number }
    }
  }
  return null
}

/**
 * IPs a las que llamar: las de tu /24 (aunque la red sea más grande, para no
 * barrer miles de direcciones), sin la de la red, la de difusión ni la tuya.
 */
export function ipsAProbar(ip: string, prefijo: number): string[] {
  if (!esIPv4(ip)) return []
  const [a, b, c, d] = ip.split('.').map(Number)
  if (prefijo > 30) return []
  const p = Math.max(prefijo, 24)
  const tam = 2 ** (32 - p)
  const inicio = d - (d % tam)
  const ips: string[] = []
  for (let x = inicio + 1; x < inicio + tam - 1; x++) if (x !== d) ips.push(`${a}.${b}.${c}.${x}`)
  return ips
}

/** ¿Estás en casa? La MAC del router tiene que ser la de config.json. */
export function enCasa(vecinos: readonly Vecino[], ipRouter: string, macRouter: string | null): boolean {
  if (!macRouter) return false
  return vecinos.some((v) => v.ip === ipRouter && v.mac === macRouter)
}

/**
 * Estado del router en la tabla de vecinos (`ip -j neigh show <ip> dev X`):
 * 'casa' solo si acaba de contestar (REACHABLE o PERMANENT) con la MAC de
 * casa; 'esperar' si la entrada es vieja o se está comprobando (STALE,
 * DELAY, PROBE: puede ser la de casa de antes de cambiar de red); 'fuera' si no.
 */
export function routerDeCasa(salida: string, ipRouter: string, macRouter: string | null): 'casa' | 'esperar' | 'fuera' {
  if (!macRouter) return 'fuera'
  const datos = json(salida)
  if (!Array.isArray(datos)) return 'fuera'
  for (const v of datos) {
    const { dst, lladdr, state } = (v ?? {}) as Record<string, unknown>
    if (dst !== ipRouter) continue
    const estados = Array.isArray(state) ? state.map(String) : []
    if (normalizarMacVecino(lladdr) !== macRouter) return 'fuera'
    if (estados.includes('REACHABLE') || estados.includes('PERMANENT')) return 'casa'
    if (estados.some((e) => e === 'STALE' || e === 'DELAY' || e === 'PROBE')) return 'esperar'
    return 'fuera'
  }
  return 'fuera'
}

/** Lee el oui.csv del IEEE («MA-L,286FB9,"Nokia…",…») → prefijo (6 hex) → fabricante. */
export function leerOui(csv: string): Map<string, string> {
  const tabla = new Map<string, string>()
  for (const linea of csv.split('\n')) {
    const m = /^MA-L,([0-9A-Fa-f]{6}),(?:"((?:[^"]|"")*)"|([^,]*)),/.exec(linea)
    if (!m) continue
    const nombre = (m[2] ?? m[3] ?? '').replace(/""/g, '"').replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, 80)
    if (nombre) tabla.set(m[1].toUpperCase(), nombre)
  }
  return tabla
}

export function fabricante(mac: string, oui: ReadonlyMap<string, string>): string | null {
  if (esMacAleatoria(mac)) return null
  return oui.get(mac.replace(/:/g, '').slice(0, 6).toUpperCase()) ?? null
}
