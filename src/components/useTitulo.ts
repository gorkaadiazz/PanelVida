import { useEffect } from 'react'

/** Pone el título de la pestaña: "Hábitos · Mi Panel" (o "Mi Panel" sin título). */
export function useTitulo(titulo?: string) {
  useEffect(() => {
    document.title = titulo ? `${titulo} · Mi Panel` : 'Mi Panel'
  }, [titulo])
}
