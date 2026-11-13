// Identificadores generados en el cliente (para poder crear filas sin conexión).
//
//  · uuid(): aleatorio (v4), para casi todo.
//  · uuidV5(): DETERMINISTA: el mismo espacio y nombre dan siempre el mismo id.
//    Se usa para las marcas de hábitos (ver idMarca): dos dispositivos que
//    marcan el mismo hábito el mismo día escriben la misma fila en vez de
//    chocar con el unique (habito_id, fecha) del servidor.
//
// El SHA-1 va implementado aquí (unas 40 líneas) porque el de la plataforma,
// crypto.subtle.digest, es asíncrono y solo existe en contextos seguros
// (HTTPS): con esto el id de una marca se calcula al instante y en cualquier
// sitio. Aquí SHA-1 no protege nada: solo reparte bits, como manda el
// estándar de UUID v5 (RFC 9562).

const FORMA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function esUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && FORMA_UUID.test(valor)
}

function aTexto(b: Uint8Array): string {
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

function aBytes(uuid: string): Uint8Array {
  if (!esUuid(uuid)) throw new RangeError(`UUID no válido: ${String(uuid)}`)
  const hex = uuid.replace(/-/g, '')
  return Uint8Array.from({ length: 16 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16))
}

/** UUID v4 aleatorio. */
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // crypto.randomUUID solo existe en contextos seguros (HTTPS o localhost);
  // getRandomValues, en todos (p. ej. al probar por IP en la red local).
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  return aTexto(b)
}

/** SHA-1 de unos bytes (20 bytes). */
export function sha1(datos: Uint8Array): Uint8Array {
  const bits = datos.length * 8
  // Relleno: un bit 1, ceros y la longitud en 64 bits, hasta múltiplo de 64 bytes
  const total = (((datos.length + 8) >> 6) + 1) << 6
  const m = new Uint8Array(total)
  m.set(datos)
  m[datos.length] = 0x80
  const vista = new DataView(m.buffer)
  vista.setUint32(total - 8, Math.floor(bits / 2 ** 32))
  vista.setUint32(total - 4, bits >>> 0)

  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]
  const w = new Uint32Array(80)
  const rotar = (x: number, n: number) => (x << n) | (x >>> (32 - n))

  for (let bloque = 0; bloque < total; bloque += 64) {
    for (let i = 0; i < 16; i++) w[i] = vista.getUint32(bloque + i * 4)
    for (let i = 16; i < 80; i++) w[i] = rotar(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1)
    let [a, b, c, d, e] = h
    for (let i = 0; i < 80; i++) {
      let f: number
      let k: number
      if (i < 20) [f, k] = [(b & c) | (~b & d), 0x5a827999]
      else if (i < 40) [f, k] = [b ^ c ^ d, 0x6ed9eba1]
      else if (i < 60) [f, k] = [(b & c) | (b & d) | (c & d), 0x8f1bbcdc]
      else [f, k] = [b ^ c ^ d, 0xca62c1d6]
      const t = (rotar(a, 5) + f + e + k + w[i]) | 0
      e = d
      d = c
      c = rotar(b, 30)
      b = a
      a = t
    }
    h[0] = (h[0] + a) | 0
    h[1] = (h[1] + b) | 0
    h[2] = (h[2] + c) | 0
    h[3] = (h[3] + d) | 0
    h[4] = (h[4] + e) | 0
  }

  const salida = new Uint8Array(20)
  const vistaSalida = new DataView(salida.buffer)
  h.forEach((x, i) => vistaSalida.setUint32(i * 4, x >>> 0))
  return salida
}

/** UUID v5 (RFC 9562): determinista a partir de un UUID "espacio" y un nombre. */
export function uuidV5(nombre: string, espacio: string): string {
  const ns = aBytes(espacio)
  const texto = new TextEncoder().encode(nombre)
  const datos = new Uint8Array(ns.length + texto.length)
  datos.set(ns)
  datos.set(texto, ns.length)
  const b = sha1(datos).slice(0, 16)
  b[6] = (b[6] & 0x0f) | 0x50 // versión 5
  b[8] = (b[8] & 0x3f) | 0x80 // variante RFC
  return aTexto(b)
}

/**
 * Id de la marca de un hábito en un día: UUID v5 con el id del hábito como
 * espacio y la fecha (AAAA-MM-DD) como nombre. TODOS los dispositivos deben
 * calcularlo igual: no cambiar esta fórmula una vez haya datos.
 */
export function idMarca(habitoId: string, fecha: string): string {
  return uuidV5(fecha, habitoId.toLowerCase())
}
