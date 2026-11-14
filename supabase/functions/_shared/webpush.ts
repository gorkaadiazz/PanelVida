// Envío de notificaciones Web Push sin dependencias: solo WebCrypto y fetch,
// así funciona igual en Deno (Edge Functions) y en Node (tests).
//
//  · Cifrado del mensaje: RFC 8291 (Web Push) sobre RFC 8188 (aes128gcm).
//    Comprobado con el ejemplo del propio RFC 8291 (tests/webpush.test.ts).
//  · Identificación del servidor: VAPID, RFC 8292 (JWT ES256).
//
// El servicio de notificaciones (Google, Mozilla, Apple) solo ve el mensaje
// cifrado: lo descifra el navegador del usuario con sus claves.

export interface Suscripcion {
  endpoint: string
  /** Clave pública del navegador (P-256 sin comprimir, base64url, 65 bytes). */
  p256dh: string
  /** Secreto de autenticación del navegador (base64url, 16 bytes). */
  auth: string
}

export interface ClavesVapid {
  /** Clave pública P-256 sin comprimir, base64url (65 bytes). */
  publica: string
  /** Clave privada P-256 (d), base64url (32 bytes). */
  privada: string
  /** Contacto del remitente: "mailto:…" o "https://…". */
  sujeto: string
}

const texto = new TextEncoder()

export function aBase64url(bytes: Uint8Array): string {
  let binario = ''
  for (const b of bytes) binario += String.fromCharCode(b)
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function deBase64url(valor: string): Uint8Array {
  const limpio = valor.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/')
  const binario = atob(limpio + '='.repeat((4 - (limpio.length % 4)) % 4))
  return Uint8Array.from(binario, (c) => c.charCodeAt(0))
}

function unir(...partes: Uint8Array[]): Uint8Array {
  const total = new Uint8Array(partes.reduce((n, p) => n + p.length, 0))
  let i = 0
  for (const p of partes) {
    total.set(p, i)
    i += p.length
  }
  return total
}

/** HKDF-SHA-256 (extraer + expandir) de `bytes` bytes. */
async function hkdf(sal: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const clave = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: sal as BufferSource, info: info as BufferSource }, clave, bytes * 8)
  return new Uint8Array(bits)
}

function jwkDeP256(publica: Uint8Array, privada?: Uint8Array): JsonWebKey {
  if (publica.length !== 65 || publica[0] !== 4) throw new Error('Clave pública P-256 no válida')
  return {
    kty: 'EC',
    crv: 'P-256',
    x: aBase64url(publica.slice(1, 33)),
    y: aBase64url(publica.slice(33, 65)),
    ...(privada ? { d: aBase64url(privada) } : {}),
    ext: true,
  }
}

/** Par de claves efímeras del servidor (una por mensaje). Se puede fijar en los tests. */
export interface ClavesEfimeras {
  publica: Uint8Array
  privada: CryptoKey
}

async function nuevasClavesEfimeras(): Promise<ClavesEfimeras> {
  const par = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  return { publica: new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey)), privada: par.privateKey }
}

export async function clavesEfimerasDe(publica: Uint8Array, privada: Uint8Array): Promise<ClavesEfimeras> {
  const clave = await crypto.subtle.importKey('jwk', jwkDeP256(publica, privada), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
  return { publica, privada: clave }
}

/**
 * Cifra un mensaje para una suscripción (RFC 8291, un solo registro).
 * `opciones` solo se usa en los tests (sal y claves fijas del ejemplo del RFC).
 */
export async function cifrar(
  mensaje: Uint8Array,
  suscripcion: Pick<Suscripcion, 'p256dh' | 'auth'>,
  opciones: { sal?: Uint8Array; efimeras?: ClavesEfimeras } = {},
): Promise<Uint8Array> {
  const uaPublica = deBase64url(suscripcion.p256dh)
  const secreto = deBase64url(suscripcion.auth)
  if (secreto.length !== 16) throw new Error('Secreto de autenticación no válido')
  const sal = opciones.sal ?? crypto.getRandomValues(new Uint8Array(16))
  const efimeras = opciones.efimeras ?? (await nuevasClavesEfimeras())

  const uaClave = await crypto.subtle.importKey('jwk', jwkDeP256(uaPublica), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaClave } as EcdhKeyDeriveParams, efimeras.privada, 256))

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" 0x00 ua_public as_public, 32)
  const infoClave = unir(texto.encode('WebPush: info\0'), uaPublica, efimeras.publica)
  const ikm = await hkdf(secreto, ecdh, infoClave, 32)
  const cek = await hkdf(sal, ikm, texto.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(sal, ikm, texto.encode('Content-Encoding: nonce\0'), 12)

  // Un único registro: mensaje + delimitador 0x02 (último registro, sin relleno)
  const claro = unir(mensaje, Uint8Array.of(2))
  const claveAes = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['encrypt'])
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, claveAes, claro as BufferSource))

  // Cabecera: sal (16) · tamaño de registro (4096, uint32) · longitud del id (65) · clave pública efímera
  const cabecera = new Uint8Array(16 + 4 + 1 + efimeras.publica.length)
  cabecera.set(sal)
  new DataView(cabecera.buffer).setUint32(16, 4096)
  cabecera[20] = efimeras.publica.length
  cabecera.set(efimeras.publica, 21)
  return unir(cabecera, cifrado)
}

/** Cabecera Authorization de VAPID para un endpoint (JWT ES256 válido 12 horas). */
export async function cabeceraVapid(endpoint: string, vapid: ClavesVapid, ahora: number = Date.now()): Promise<string> {
  const publica = deBase64url(vapid.publica)
  const clave = await crypto.subtle.importKey('jwk', jwkDeP256(publica, deBase64url(vapid.privada)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const cabecera = aBase64url(texto.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const datos = aBase64url(
    texto.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(ahora / 1000) + 12 * 3600, sub: vapid.sujeto })),
  )
  // WebCrypto firma ECDSA en formato r||s (64 bytes), que es justo el de JWS
  const firma = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, clave, texto.encode(`${cabecera}.${datos}`)))
  return `vapid t=${cabecera}.${datos}.${aBase64url(firma)}, k=${vapid.publica}`
}

/**
 * Servicios de notificaciones de los navegadores. Solo se envía a estos: el
 * endpoint lo escribe el navegador del usuario en la base de datos y no se
 * puede usar la función para hacer peticiones a cualquier sitio.
 */
const SERVICIOS_PUSH = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge, Android
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /^web\.push\.apple\.com$/, // Safari (macOS, iPhone)
  /^[a-z0-9-]+\.notify\.windows\.com$/, // Edge antiguo (WNS)
]

export function endpointPermitido(endpoint: string): boolean {
  try {
    const url = new URL(endpoint)
    return url.protocol === 'https:' && !url.port && !url.username && !url.password && SERVICIOS_PUSH.some((r) => r.test(url.hostname))
  } catch {
    return false
  }
}

export type ResultadoEnvio = 'enviado' | 'caducada' | 'error'

/**
 * Envía una notificación. 'caducada' (404/410) = el navegador ya no tiene
 * esa suscripción: hay que borrarla. Un endpoint que no es de un servicio
 * de notificaciones conocido también se da por caducado (y no se llama).
 */
export async function enviar(suscripcion: Suscripcion, mensaje: object, vapid: ClavesVapid, ttlSegundos = 12 * 3600): Promise<ResultadoEnvio> {
  if (!endpointPermitido(suscripcion.endpoint)) return 'caducada'
  const cuerpo = await cifrar(texto.encode(JSON.stringify(mensaje)), suscripcion)
  const respuesta = await fetch(suscripcion.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await cabeceraVapid(suscripcion.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttlSegundos),
      Urgency: 'normal',
    },
    body: cuerpo as BodyInit,
    redirect: 'manual', // un servicio push no redirige: no seguir a otro sitio
    signal: AbortSignal.timeout(10_000),
  })
  await respuesta.body?.cancel()
  if (respuesta.status === 404 || respuesta.status === 410) return 'caducada'
  return respuesta.ok ? 'enviado' : 'error'
}
