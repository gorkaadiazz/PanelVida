import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Menú desplegable con <details class="menu"> (p. ej. «Convertir en…»).
 * <details> solo se abre y cierra con su botón; aquí además se cierra al
 * pulsar fuera, con Esc (el foco vuelve al botón), al salir con Tab y al
 * elegir una opción. Al abrirse, la lista se desplaza a la vista para no
 * quedar bajo la barra inferior o el botón «+» (respeta scroll-padding).
 * Los hijos son los <li> con un `.menu__item` dentro.
 */
export function MenuDesplegable({ texto, etiqueta, children }: { texto: string; /** Nombre accesible completo; debe empezar por `texto`. */ etiqueta?: string; children: ReactNode }) {
  const menu = useRef<HTMLDetailsElement>(null)
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    const el = menu.current
    if (!abierto || !el) return
    el.querySelector('.menu__lista')?.scrollIntoView({ block: 'nearest' })

    function cerrar(devolverFoco: boolean) {
      if (!el) return
      el.open = false
      if (devolverFoco) el.querySelector('summary')?.focus()
    }
    function alPulsar(e: PointerEvent) {
      if (!el?.contains(e.target as Node)) cerrar(false)
    }
    function alTeclear(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        cerrar(true)
      }
    }
    // Solo si el foco va a otro elemento (Tab); los clics fuera ya los cubre alPulsar
    function alSalir(e: FocusEvent) {
      const destino = e.relatedTarget as Node | null
      if (destino && !el?.contains(destino)) cerrar(false)
    }

    document.addEventListener('pointerdown', alPulsar)
    el.addEventListener('keydown', alTeclear)
    el.addEventListener('focusout', alSalir)
    return () => {
      document.removeEventListener('pointerdown', alPulsar)
      el.removeEventListener('keydown', alTeclear)
      el.removeEventListener('focusout', alSalir)
    }
  }, [abierto])

  return (
    <details ref={menu} className="menu" onToggle={(e) => setAbierto(e.currentTarget.open)}>
      <summary className="btn btn--ghost" aria-label={etiqueta}>
        {texto}
      </summary>
      <ul
        className="menu__lista float"
        role="list"
        onClick={(e) => {
          if ((e.target as Element).closest('a, button') && menu.current) menu.current.open = false
        }}
      >
        {children}
      </ul>
    </details>
  )
}
