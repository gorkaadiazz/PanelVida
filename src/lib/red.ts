// Vigilante de la red: lógica pura de la app (sin React ni Supabase).

export interface Aparato {
  id: string
  mac: string
  nombre: string | null
  /** Cómo se anuncia en la red (lo averigua el agente): «Amazon Fire TV o Echo»… */
  nombre_red?: string | null
  fabricante: string | null
  ip: string | null
  aleatoria: boolean
  conectado: boolean
  conocido: boolean
  unido_a: string | null
  primera_vez: string
  ultima_vez: string
}

/** Un aparato «de verdad» con los que se le han unido (MAC aleatorias del mismo móvil). */
export interface Grupo<A extends Aparato> {
  principal: A
  unidos: A[]
  conectado: boolean
  ip: string | null
  ultima_vez: string
}

/**
 * Junta los unidos con su principal y ordena: primero los DESCONOCIDOS, y
 * dentro de cada bloque los conectados primero y por nombre.
 */
export function agrupar<A extends Aparato>(aparatos: readonly A[]): Grupo<A>[] {
  const porId = new Map(aparatos.map((a) => [a.id, a]))
  // Sigue las uniones hasta el principal. Si hay un ciclo (la base de datos no
  // lo impide), el principal es el de id menor del ciclo: así todos los del
  // ciclo caen en el mismo grupo y nadie sale dos veces.
  const raiz = (a: A): A => {
    const camino: A[] = []
    const vistos = new Set<string>()
    let actual = a
    while (actual.unido_a && porId.has(actual.unido_a) && !vistos.has(actual.id)) {
      camino.push(actual)
      vistos.add(actual.id)
      actual = porId.get(actual.unido_a)!
    }
    if (!vistos.has(actual.id)) return actual
    return camino.slice(camino.indexOf(actual)).reduce((m, x) => (x.id < m.id ? x : m))
  }
  const grupos = new Map<string, Grupo<A>>()
  for (const a of aparatos) {
    const r = raiz(a)
    const g = grupos.get(r.id) ?? { principal: r, unidos: [], conectado: false, ip: null, ultima_vez: r.ultima_vez }
    if (a.id !== r.id) g.unidos.push(a)
    grupos.set(r.id, g)
  }
  for (const g of grupos.values()) {
    const todos = [g.principal, ...g.unidos]
    g.conectado = todos.some((a) => a.conectado)
    const ultimo = [...todos].sort((x, y) => y.ultima_vez.localeCompare(x.ultima_vez))[0]
    g.ultima_vez = ultimo.ultima_vez
    g.ip = todos.find((a) => a.conectado)?.ip ?? ultimo.ip
  }
  return [...grupos.values()].sort(
    (a, b) =>
      Number(a.principal.conocido) - Number(b.principal.conocido) ||
      Number(b.conectado) - Number(a.conectado) ||
      nombreAparato(a.principal).localeCompare(nombreAparato(b.principal), 'es'),
  )
}

/**
 * Cómo se llama en pantalla: tu nombre, cómo se anuncia (solo si ya es
 * CONOCIDO), el fabricante o «MAC privada». Un desconocido no se presenta con
 * su nombre anunciado: cualquiera puede anunciarse como «iPhone de Ana» para
 * pasar por un aparato tuyo (ese nombre sale aparte, como «se anuncia como…»).
 */
export function nombreAparato(a: Pick<Aparato, 'nombre' | 'nombre_red' | 'fabricante' | 'aleatoria' | 'mac'> & { conocido?: boolean }): string {
  return a.nombre ?? (a.conocido ? a.nombre_red : null) ?? a.fabricante ?? (a.aleatoria ? 'Aparato con MAC privada' : `Aparato ${a.mac.slice(-8)}`)
}

/** Desconocidos conectados ahora (para el aviso de Inicio). */
export function desconocidosConectados<A extends Aparato>(aparatos: readonly A[]): Grupo<A>[] {
  return agrupar(aparatos).filter((g) => !g.principal.conocido && g.conectado)
}

export function validarNombreAparato(nombre: string): string | null {
  const limpio = nombre.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim()
  if (!limpio) return null
  return [...limpio].slice(0, 40).join('')
}

export interface Intervalo {
  desde: string
  hasta: string
}

/** Minutos conectado en total (para el historial). */
export function minutosConectado(intervalos: readonly Intervalo[]): number {
  return Math.round(intervalos.reduce((n, i) => n + Math.max(0, Date.parse(i.hasta) - Date.parse(i.desde)), 0) / 60_000)
}
