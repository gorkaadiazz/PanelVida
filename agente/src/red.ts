// Agente del PC · escanear la red de casa (sin privilegios). La lógica de
// leer y decidir está en lib/red.ts; aquí solo se habla con el sistema.

import { execFile } from 'node:child_process'
import { createSocket } from 'node:dgram'
import { Resolver } from 'node:dns/promises'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { leerAvahi, nombreDeRed } from './lib/nombres.ts'
import { fabricante, ipsAProbar, leerDireccion, leerOui, leerRutaPorDefecto, leerVecinos, normalizarMacVecino, routerDeCasa, type Vecino } from './lib/red.ts'

const ejecutar = promisify(execFile)
const ESPERA_ARP_MS = 2500
export const ARCHIVO_OUI = join(homedir(), '.local', 'share', 'mipanel-agente', 'oui.csv')

let oui: Map<string, string> | null = null
async function tablaOui(): Promise<Map<string, string>> {
  if (oui) return oui
  try {
    oui = leerOui(await readFile(ARCHIVO_OUI, 'utf8'))
  } catch {
    oui = new Map() // sin la lista del IEEE: sin fabricantes
  }
  return oui
}

async function ip(args: string[]): Promise<string> {
  const { stdout } = await ejecutar('ip', args, { timeout: 5000, maxBuffer: 2 * 1024 * 1024 })
  return stdout
}

/** Manda un paquete UDP vacío a cada IP (puerto 9, «discard»): obliga al kernel a preguntar por ARP. */
async function tocarTodas(ips: readonly string[]): Promise<void> {
  const s = createSocket('udp4')
  s.on('error', () => {})
  for (const destino of ips) {
    await new Promise<void>((ok) => s.send(Buffer.alloc(0), 9, destino, () => ok()))
  }
  s.close()
}

export interface Router {
  ip: string
  dev: string
  mac: string | null
}

/** La puerta de enlace (router) de ahora, con su MAC si ya está en la tabla de vecinos. */
export async function routerActual(): Promise<Router | null> {
  const ruta = leerRutaPorDefecto(await ip(['-j', 'route', 'show', 'default']))
  if (!ruta) return null
  await tocarTodas([ruta.ip])
  await new Promise((ok) => setTimeout(ok, 500))
  const vecinos = leerVecinos(await ip(['-j', 'neigh', 'show', 'dev', ruta.dev]))
  return { ...ruta, mac: vecinos.find((v) => v.ip === ruta.ip)?.mac ?? null }
}

export interface Escaneo {
  dispositivos: { mac: string; ip: string; fabricante: string | null; nombre_red: string | null }[]
}

/** Lo que anuncian los aparatos por mDNS (si Avahi está instalado). Vacío si no. */
async function anunciosMdns(): Promise<string> {
  try {
    const { stdout } = await ejecutar('avahi-browse', ['--all', '--resolve', '--terminate', '--parsable', '--no-db-lookup'], {
      timeout: 5000,
      maxBuffer: 2 * 1024 * 1024,
    })
    return stdout
  } catch (e) {
    // Si se corta por tiempo, lo que llegó a escribir sirve igual
    return String((e as { stdout?: unknown }).stdout ?? '')
  }
}

/** El nombre que conoce el router (DNS inverso preguntándole a él), si lo da. */
async function nombresDns(ips: readonly string[], router: string): Promise<Map<string, string>> {
  const r = new Resolver({ timeout: 800, tries: 1 })
  r.setServers([router])
  const nombres = new Map<string, string>()
  for (let i = 0; i < ips.length; i += 16) {
    await Promise.all(
      ips.slice(i, i + 16).map(async (ip) => {
        try {
          const [nombre] = await r.reverse(ip)
          if (nombre) nombres.set(ip, nombre)
        } catch {
          // sin nombre
        }
      }),
    )
  }
  return nombres
}

/** Nombre legible de cada IP (mDNS y, si no, DNS del router). */
async function nombresEnRed(ips: readonly string[], router: string): Promise<Map<string, string>> {
  const [mdns, dns] = await Promise.all([anunciosMdns().then(leerAvahi), nombresDns(ips, router)])
  const nombres = new Map<string, string>()
  for (const ip of ips) {
    const n = nombreDeRed(mdns.get(ip), dns.get(ip) ?? null)
    if (n) nombres.set(ip, n)
  }
  return nombres
}

/** Escanea si estás en casa (router = macRouter). null si no estás en casa o no se puede. */
export async function escanear(macRouter: string | null): Promise<Escaneo | null> {
  if (!macRouter) return null
  const ruta = leerRutaPorDefecto(await ip(['-j', 'route', 'show', 'default']))
  if (!ruta) return null
  const direccion = leerDireccion(await ip(['-j', '-4', 'addr', 'show', 'dev', ruta.dev]))
  if (!direccion) return null

  // ¿Estás en casa? Primero solo el router (así fuera de casa no se barre
  // ninguna red ajena), y solo si ACABA de contestar con la MAC de casa: una
  // entrada vieja (STALE) podría ser la de casa antes de cambiar de red.
  let casa: 'casa' | 'esperar' | 'fuera' = 'esperar'
  for (let intento = 0; intento < 3 && casa === 'esperar'; intento++) {
    await tocarTodas([ruta.ip])
    await new Promise((ok) => setTimeout(ok, 700))
    casa = routerDeCasa(await ip(['-j', 'neigh', 'show', ruta.ip, 'dev', ruta.dev]), ruta.ip, macRouter)
  }
  if (casa !== 'casa') return null

  await tocarTodas(ipsAProbar(direccion.ip, direccion.prefijo))
  await new Promise((ok) => setTimeout(ok, ESPERA_ARP_MS))
  const vecinos: Vecino[] = leerVecinos(await ip(['-j', 'neigh', 'show', 'dev', ruta.dev]))

  // Este mismo PC no está en su tabla de vecinos: se añade aparte
  try {
    const enlace = JSON.parse(await ip(['-j', 'link', 'show', 'dev', ruta.dev])) as { address?: string }[]
    const propia = normalizarMacVecino(enlace[0]?.address)
    if (propia && !vecinos.some((v) => v.mac === propia)) vecinos.push({ ip: direccion.ip, mac: propia })
  } catch {
    // sin la MAC propia, sigue
  }

  const tabla = await tablaOui()
  const lista = vecinos.slice(0, 512)
  const nombres = await nombresEnRed(lista.map((v) => v.ip), ruta.ip)
  return {
    dispositivos: lista.map((v) => ({ mac: v.mac, ip: v.ip, fabricante: fabricante(v.mac, tabla), nombre_red: nombres.get(v.ip) ?? null })),
  }
}
