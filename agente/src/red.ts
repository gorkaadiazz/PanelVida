// Agente del PC · escanear la red de casa (sin privilegios). La lógica de
// leer y decidir está en lib/red.ts; aquí solo se habla con el sistema.

import { execFile } from 'node:child_process'
import { createSocket } from 'node:dgram'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
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
  dispositivos: { mac: string; ip: string; fabricante: string | null }[]
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
  return { dispositivos: vecinos.slice(0, 512).map((v) => ({ mac: v.mac, ip: v.ip, fabricante: fabricante(v.mac, tabla) })) }
}
