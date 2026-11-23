// Agente del PC · cómo se llama cada aparato de la red (lógica pura).
//
// Muchos aparatos se anuncian en la red local por mDNS (Avahi/Bonjour): una
// tele dice «soy un Amazon Fire TV», un Chromecast dice «Tele salón», una
// impresora dice que imprime… Con eso se forma un nombre legible para la
// pantalla Red de casa. Si el aparato no se anuncia, se intenta el nombre que
// conoce el router (DNS inverso). Todo es TEXTO para enseñar, nunca se ejecuta.

/** Tipo de servicio mDNS → qué aparato suele ser. */
const TIPOS: Record<string, string> = {
  '_googlecast._tcp': 'Chromecast o Google TV',
  '_androidtvremote2._tcp': 'Android TV',
  '_androidtvremote._tcp': 'Android TV',
  '_amzn-wplay._tcp': 'Amazon Fire TV o Echo',
  '_airplay._tcp': 'Aparato Apple (AirPlay)',
  '_raop._tcp': 'Altavoz o tele con AirPlay',
  '_companion-link._tcp': 'Aparato Apple',
  '_apple-mobdev2._tcp': 'iPhone o iPad',
  '_homekit._tcp': 'Aparato HomeKit',
  '_hap._tcp': 'Aparato HomeKit',
  '_hap._udp': 'Aparato HomeKit',
  '_matter._tcp': 'Aparato domótico (Matter)',
  '_matterc._udp': 'Aparato domótico (Matter)',
  '_matterd._udp': 'Aparato domótico (Matter)',
  '_ipp._tcp': 'Impresora',
  '_ipps._tcp': 'Impresora',
  '_printer._tcp': 'Impresora',
  '_pdl-datastream._tcp': 'Impresora',
  '_scanner._tcp': 'Escáner',
  '_uscan._tcp': 'Escáner',
  '_spotify-connect._tcp': 'Altavoz o tele (Spotify)',
  '_sonos._tcp': 'Altavoz Sonos',
  '_smb._tcp': 'Ordenador o disco en red',
  '_afpovertcp._tcp': 'Mac o disco en red',
  '_workstation._tcp': 'Ordenador',
  '_ssh._tcp': 'Ordenador o servidor',
  '_sftp-ssh._tcp': 'Ordenador o servidor',
  '_kdeconnect._udp': 'PC o móvil con KDE Connect',
  '_home-assistant._tcp': 'Home Assistant',
  '_esphomelib._tcp': 'Aparato domótico (ESPHome)',
  '_hue._tcp': 'Puente Philips Hue',
  '_viziocast._tcp': 'Tele Vizio',
  '_nvstream._tcp': 'PC con NVIDIA GameStream',
}

/** Algunos aparatos ponen el tipo tal cual en vez de «_algo._tcp». */
const TIPOS_LITERALES = new Set(['Amazon Fire TV'])

export interface Anuncio {
  /** Nombres de instancia («Tele salón», «HP LaserJet…», o ids sin sentido). */
  instancias: string[]
  tipos: string[]
  hosts: string[]
}

/** avahi escapa con \DDD (decimal): «\032» es un espacio, «\058» dos puntos… */
export function desescaparAvahi(texto: string): string {
  return texto.replace(/\\(\d{3})/g, (_, d: string) => String.fromCharCode(Number(d))).replace(/\\(.)/g, '$1')
}

/**
 * Lee `avahi-browse -a -r -t -p` (líneas «=;iface;IPv4;instancia;tipo;dominio;host;ip;puerto;txt»).
 * Devuelve lo que anuncia cada IP.
 */
export function leerAvahi(salida: string): Map<string, Anuncio> {
  const porIp = new Map<string, Anuncio>()
  for (const linea of salida.split('\n')) {
    if (!linea.startsWith('=;')) continue
    // Los «;» de dentro van escapados como \059, así que se puede partir por «;»
    const campos = linea.split(';')
    if (campos.length < 8 || campos[2] !== 'IPv4') continue
    const ip = campos[7]
    if (!/^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(ip)) continue
    const a = porIp.get(ip) ?? { instancias: [], tipos: [], hosts: [] }
    const instancia = desescaparAvahi(campos[3]).trim()
    const tipo = desescaparAvahi(campos[4]).trim()
    const host = desescaparAvahi(campos[6]).trim()
    if (instancia && !a.instancias.includes(instancia)) a.instancias.push(instancia)
    if (tipo && !a.tipos.includes(tipo)) a.tipos.push(tipo)
    if (host && !a.hosts.includes(host)) a.hosts.push(host)
    porIp.set(ip, a)
  }
  return porIp
}

const limpiar = (t: string) => t.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim()

/**
 * ¿Parece un nombre puesto por una persona o un fabricante? No: ids en
 * hexadecimal, uuid, «192-168-1-34», cadenas con muchos dígitos o símbolos.
 */
export function esNombreHumano(texto: string): boolean {
  const t = limpiar(texto)
  if (t.length < 2 || t.length > 50) return false
  if (/^[0-9a-f]{8,}$/i.test(t.replace(/[-:._ ]/g, ''))) return false
  // Un id corto en hexadecimal («AE36») tampoco es un nombre
  if (/^[0-9a-f]+$/i.test(t) && /\d/.test(t)) return false
  if (/^\d{1,3}([-.]\d{1,3}){3}$/.test(t)) return false
  if (/[\\{}<>:]/.test(t)) return false
  // Una tira larga de hexadecimal dentro (ids de fabricante) delata un identificador
  if (/[0-9a-f]{8,}/i.test(t)) return false
  const letras = (t.match(/\p{L}/gu) ?? []).length
  const digitos = (t.match(/\d/g) ?? []).length
  return letras >= 2 && digitos <= letras
}

/** Nombre de host sin el dominio local («Galaxy-S23.local» → «Galaxy-S23»). null si no es legible. */
export function hostLegible(host: string): string | null {
  const sin = limpiar(host).replace(/\.(local|lan|home|homestation|localdomain|box|router)\.?$/i, '').replace(/\.$/, '')
  if (sin.includes('.') || !esNombreHumano(sin)) return null
  return sin
}

/**
 * Servicios que tienen aparatos de todo tipo (una tele también es «Matter» y
 * «Spotify»): solo cuentan si no hay nada más concreto.
 */
const GENERICOS = new Set(['_matter._tcp', '_matterc._udp', '_matterd._udp', '_spotify-connect._tcp', '_ssh._tcp', '_sftp-ssh._tcp', '_smb._tcp', '_workstation._tcp'])

/** Qué tipo de aparato es por lo que anuncia: lo más concreto que se reconozca. */
export function tipoDeAparato(a: Anuncio): string | null {
  let generico: string | null = null
  for (const t of a.tipos) {
    if (TIPOS_LITERALES.has(t)) return t
    const conocido = TIPOS[t.toLowerCase()]
    if (!conocido) continue
    if (!GENERICOS.has(t.toLowerCase())) return conocido
    generico ??= conocido
  }
  return generico
}

const MAX = 60

/**
 * El nombre para enseñar: «Tele salón (Chromecast o Google TV)», «Amazon Fire
 * TV o Echo», «Galaxy-S23»… o null si no se sabe nada útil.
 */
export function nombreDeRed(a: Anuncio | undefined, dns: string | null): string | null {
  const tipo = a ? tipoDeAparato(a) : null
  const propio = a?.instancias.map(limpiar).find(esNombreHumano) ?? a?.hosts.map(hostLegible).find((h): h is string => h !== null) ?? (dns ? hostLegible(dns) : null)
  let nombre: string | null
  if (propio && tipo && !propio.toLowerCase().includes(tipo.toLowerCase())) nombre = `${propio} (${tipo})`
  else nombre = propio ?? tipo
  if (!nombre) return null
  const letras = [...nombre]
  return letras.length <= MAX ? nombre : `${letras.slice(0, MAX - 1).join('').trimEnd()}…`
}
