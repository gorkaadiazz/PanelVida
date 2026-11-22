// Tipo de cuenta: 'normal' (todo Mi Panel) o 'solo_lista' (la familia: solo
// la Lista de la compra). Lo decide la base de datos (tipo_cuenta(), con la
// tabla cuentas_solo_lista). Aquí solo se pregunta y se recuerda en este
// navegador para poder abrir sin conexión.
//
// OJO: esto solo decide qué pantallas se enseñan. La seguridad está en las
// políticas RLS restrictivas: aunque alguien cambiase lo guardado aquí, la
// base de datos no le dejaría leer ni escribir nada fuera de la lista.

import { supabase } from '../lib/supabase'

export type TipoCuenta = 'normal' | 'solo_lista'

const clave = (usuarioId: string) => `mipanel:tipo:${usuarioId}`

export function esTipoCuenta(valor: unknown): valor is TipoCuenta {
  return valor === 'normal' || valor === 'solo_lista'
}

/** El último tipo conocido en este navegador (null si nunca se ha preguntado). */
export function tipoGuardado(usuarioId: string): TipoCuenta | null {
  try {
    const valor = localStorage.getItem(clave(usuarioId))
    return esTipoCuenta(valor) ? valor : null
  } catch {
    return null
  }
}

/** Pregunta al servidor y lo recuerda. null si no se ha podido preguntar (sin conexión). */
export async function consultarTipo(usuarioId: string): Promise<TipoCuenta | null> {
  const { data, error } = await supabase.rpc('tipo_cuenta')
  if (error || !esTipoCuenta(data)) {
    if (error) console.warn('tipo_cuenta', error)
    return null
  }
  try {
    localStorage.setItem(clave(usuarioId), data)
  } catch {
    // Sin localStorage: se volverá a preguntar la próxima vez
  }
  return data
}
