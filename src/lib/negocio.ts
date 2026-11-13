// Lógica pura del negocio de páginas web: estados de los clientes y cifras.
// Importes en céntimos. Sin React ni Supabase.

import { ErrorDeValidacion } from './validacion'

export { ErrorDeValidacion }

export const ESTADOS = ['contacto', 'propuesta', 'en_curso', 'entregado'] as const
export type EstadoCliente = (typeof ESTADOS)[number]

export const NOMBRE_ESTADO: Record<EstadoCliente, string> = {
  contacto: 'Contacto',
  propuesta: 'Propuesta',
  en_curso: 'En curso',
  entregado: 'Entregado',
}

export const NOMBRE_CLIENTE_MAX = 120
export const NOTAS_MAX = 2000

export interface ClienteBasico {
  id: string
  nombre: string
  precio_centimos: number
  estado: string
  orden: number
  created_at: string
}

export interface ResumenNegocio {
  porEstado: Record<EstadoCliente, number>
  /** Suma de los precios de los entregados. */
  facturado: number
  /** Suma de los precios de los que están en curso. */
  enCurso: number
}

export function esEstado(valor: string): valor is EstadoCliente {
  return (ESTADOS as readonly string[]).includes(valor)
}

export function validarNombreCliente(nombre: string): string {
  const limpio = nombre.trim().replace(/\s+/g, ' ')
  if (!limpio) throw new ErrorDeValidacion('Escribe el nombre del cliente.')
  if (limpio.length > NOMBRE_CLIENTE_MAX) throw new ErrorDeValidacion(`El nombre no puede tener más de ${NOMBRE_CLIENTE_MAX} caracteres.`)
  return limpio
}

export function validarNotas(notas: string): string {
  const limpio = notas.trim()
  if (limpio.length > NOTAS_MAX) throw new ErrorDeValidacion(`Las notas no pueden tener más de ${NOTAS_MAX} caracteres.`)
  return limpio
}

export function validarEstado(estado: string): EstadoCliente {
  if (!esEstado(estado)) throw new ErrorDeValidacion('El estado no es válido.')
  return estado
}

export function resumenNegocio(clientes: readonly ClienteBasico[]): ResumenNegocio {
  const porEstado = { contacto: 0, propuesta: 0, en_curso: 0, entregado: 0 }
  let facturado = 0
  let enCurso = 0
  for (const c of clientes) {
    if (!esEstado(c.estado)) continue
    porEstado[c.estado] += 1
    if (c.estado === 'entregado') facturado += c.precio_centimos
    else if (c.estado === 'en_curso') enCurso += c.precio_centimos
  }
  return { porEstado, facturado, enCurso }
}

/** Clientes de un estado, en su orden (a igual orden, el más antiguo primero). */
export function clientesDe<C extends ClienteBasico>(clientes: readonly C[], estado: EstadoCliente): C[] {
  return clientes
    .filter((c) => c.estado === estado)
    .sort((a, b) => a.orden - b.orden || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
}

/** Orden para un cliente que entra en un estado: detrás de los que ya hay. */
export function ordenAlFinal(clientes: readonly ClienteBasico[], estado: EstadoCliente): number {
  return clientes.filter((c) => c.estado === estado).reduce((max, c) => Math.max(max, c.orden), -1) + 1
}
