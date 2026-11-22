import { useEffect, useState } from 'react'
import { consultarTipo, tipoGuardado, type TipoCuenta } from '../repos/cuenta'

/**
 * Tipo de la cuenta con sesión. Devuelve al momento el que se recuerda en
 * este navegador y lo confirma con el servidor. Mientras no se sabe nada
 * (primera vez, esperando respuesta) devuelve null; sin conexión y sin nada
 * guardado, 'normal' (la base de datos sigue protegiendo igual).
 */
export function useTipoCuenta(usuarioId: string | null): TipoCuenta | null {
  const [tipo, setTipo] = useState<{ usuario: string | null; valor: TipoCuenta | null }>(() => ({
    usuario: usuarioId,
    valor: usuarioId ? tipoGuardado(usuarioId) : null,
  }))
  // Otra cuenta en el mismo navegador: se empieza de cero
  if (tipo.usuario !== usuarioId) setTipo({ usuario: usuarioId, valor: usuarioId ? tipoGuardado(usuarioId) : null })

  useEffect(() => {
    if (!usuarioId) return
    let vivo = true
    void consultarTipo(usuarioId).then((valor) => {
      if (!vivo) return
      setTipo((actual) => {
        if (actual.usuario !== usuarioId) return actual
        if (valor) return { usuario: usuarioId, valor }
        // Sin respuesta: lo guardado, o 'normal' si no hay nada
        return { usuario: usuarioId, valor: actual.valor ?? 'normal' }
      })
    })
    return () => {
      vivo = false
    }
  }, [usuarioId])

  return tipo.usuario === usuarioId ? tipo.valor : null
}
