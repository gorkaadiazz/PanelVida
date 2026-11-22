// Iconos propios: 24 × 24, trazo 1.75, extremos redondeados, currentColor.
// El tamaño final lo pone el CSS del contenedor (barra, aviso, vacío…).
// Son decorativos (aria-hidden): el texto de al lado da el significado.

import type { ReactNode, SVGProps } from 'react'

type PropsIcono = SVGProps<SVGSVGElement>

function Icono({ children, ...props }: PropsIcono & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

export function IconoInicio(props: PropsIcono) {
  return (
    <Icono {...props}>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6 9v10a1 1 0 0 0 1 1h3.5v-5.5h3V20H17a1 1 0 0 0 1-1V9" />
    </Icono>
  )
}

export function IconoHabitos(props: PropsIcono) {
  return (
    <Icono {...props}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </Icono>
  )
}

export function IconoTareas(props: PropsIcono) {
  return (
    <Icono {...props}>
      <path d="m4 6.5 1.5 1.5L8 5.5" />
      <path d="m4 13.5 1.5 1.5L8 12.5" />
      <path d="M11 7h9" />
      <path d="M11 14h9" />
      <path d="M11 20h9" />
      <path d="M5.5 20h1" />
    </Icono>
  )
}

export function IconoEstudios(props: PropsIcono) {
  return (
    <Icono {...props}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5Z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5Z" />
      <path d="M7 8h1.5" />
      <path d="M15.5 8H17" />
    </Icono>
  )
}

export function IconoDinero(props: PropsIcono) {
  return (
    <Icono {...props}>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" />
      <path d="M4 7.5v10A2.5 2.5 0 0 0 6.5 20H20V8H6.5A2.5 2.5 0 0 1 4 5.5" />
      <path d="M16 14h.01" />
    </Icono>
  )
}

export function IconoNegocio(props: PropsIcono) {
  return (
    <Icono {...props}>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M3.5 9h17" />
      <path d="M6.5 7h.01" />
      <path d="M9 7h.01" />
      <path d="m10 13-2 2 2 2" />
      <path d="m14 13 2 2-2 2" />
    </Icono>
  )
}

export function IconoMas(props: PropsIcono) {
  return (
    <Icono {...props}>
      <path d="M5 7h14" />
      <path d="M5 12h14" />
      <path d="M5 17h14" />
    </Icono>
  )
}

export function IconoCuenta(props: PropsIcono) {
  return (
    <Icono {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.5 18.2a6.5 6.5 0 0 1 11 0" />
    </Icono>
  )
}

export function IconoSinConexion(props: PropsIcono) {
  return (
    <Icono {...props}>
      <path d="M3 3l18 18" />
      <path d="M8.5 16.5a5 5 0 0 1 7 0" />
      <path d="M5 13a10 10 0 0 1 5.2-2.8" />
      <path d="M13.8 10.2A10 10 0 0 1 19 13" />
      <path d="M2 9.5a14.5 14.5 0 0 1 4.2-2.6" />
      <path d="M10.5 5.6A14.5 14.5 0 0 1 22 9.5" />
      <path d="M12 20h.01" />
    </Icono>
  )
}

export function IconoActualizar(props: PropsIcono) {
  return (
    <Icono {...props}>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4.5v4h-4" />
    </Icono>
  )
}

export function IconoAviso(props: PropsIcono) {
  return (
    <Icono {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5" />
      <path d="M12 16h.01" />
    </Icono>
  )
}

export function IconoCandado(props: PropsIcono) {
  return (
    <Icono {...props}>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </Icono>
  )
}

export function IconoFlecha(props: PropsIcono) {
  return (
    <Icono {...props}>
      <path d="m9.5 6 6 6-6 6" />
    </Icono>
  )
}

export function IconoMasUno(props: PropsIcono) {
  return (
    <Icono {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Icono>
  )
}

export function IconoBorrar(props: PropsIcono) {
  return (
    <Icono {...props}>
      <path d="M4.5 7h15" />
      <path d="M9.5 7V4.5h5V7" />
      <path d="M6.5 7l.9 12.1a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </Icono>
  )
}

export function IconoEditar(props: PropsIcono) {
  return (
    <Icono {...props}>
      <path d="M4.5 19.5h4l10-10a2.1 2.1 0 0 0-3-3l-10 10z" />
      <path d="m13.5 8.5 3 3" />
    </Icono>
  )
}

export function IconoSubir(props: PropsIcono) {
  return (
    <Icono {...props}>
      <path d="m6 14.5 6-6 6 6" />
    </Icono>
  )
}

export function IconoBajar(props: PropsIcono) {
  return (
    <Icono {...props}>
      <path d="m6 9.5 6 6 6-6" />
    </Icono>
  )
}

export function IconoArchivar(props: PropsIcono) {
  return (
    <Icono {...props}>
      <rect x="3.5" y="4.5" width="17" height="4" rx="1" />
      <path d="M5 8.5v10a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-10" />
      <path d="M10 12.5h4" />
    </Icono>
  )
}

export function IconoRacha(props: PropsIcono) {
  return (
    <Icono {...props}>
      <path d="M12 21c3.6 0 6-2.4 6-5.8 0-3.7-3-5.6-3.8-9.2-1.9 1.5-2.6 3.3-2.6 4.8-1-.6-1.7-1.6-2-3C7.7 9.6 6 11.9 6 15.2 6 18.6 8.4 21 12 21z" />
    </Icono>
  )
}

export function IconoExterno(props: PropsIcono) {
  return (
    <Icono {...props}>
      <path d="M14 4.5h5.5V10" />
      <path d="m19.5 4.5-8 8" />
      <path d="M17 13.5v4.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 5 18V9a1.5 1.5 0 0 1 1.5-1.5H11" />
    </Icono>
  )
}

export function IconoIdea(props: PropsIcono) {
  return (
    <Icono {...props}>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3Z" />
    </Icono>
  )
}

export function IconoCumple(props: PropsIcono) {
  return (
    <Icono {...props}>
      <path d="M4 21h16" />
      <path d="M5 21v-7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7" />
      <path d="M5 16c1.5 0 1.5 1 3.5 1s2-1 3.5-1 1.5 1 3.5 1 2-1 3.5-1" />
      <path d="M12 12V8" />
      <path d="M12 3.5c.9 1 1.2 1.8.9 2.5-.2.5-.5.7-.9.7s-.7-.2-.9-.7c-.3-.7 0-1.5.9-2.5Z" />
    </Icono>
  )
}

export function IconoPlan(props: PropsIcono) {
  return (
    <Icono {...props}>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </Icono>
  )
}

export function IconoDeseo(props: PropsIcono) {
  return (
    <Icono {...props}>
      <path d="M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8" />
      <rect x="3" y="7" width="18" height="5" rx="1" />
      <path d="M12 7v14" />
      <path d="M12 7c-1.5-2.5-5-3-5-.8C7 7 9 7 12 7Z" />
      <path d="M12 7c1.5-2.5 5-3 5-.8C17 7 15 7 12 7Z" />
    </Icono>
  )
}

// --- Fase 9: Casa ---

export function IconoCasa(props: PropsIcono) {
  return (
    <Icono {...props}>
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M10 20v-5h4v5" />
    </Icono>
  )
}

/** Puente: dos pantallas con flechas de ida y vuelta. */
export function IconoPuente(props: PropsIcono) {
  return (
    <Icono {...props}>
      <rect x="2.5" y="5" width="7" height="12" rx="1.5" />
      <rect x="14.5" y="4" width="7" height="10" rx="1" />
      <path d="M11 9.5h2.5M12.5 8l1.5 1.5-1.5 1.5" />
      <path d="M13 13.5h-2.5M11.5 12 10 13.5l1.5 1.5" />
      <path d="M16.5 18h3" />
    </Icono>
  )
}

export function IconoCopiar(props: PropsIcono) {
  return (
    <Icono {...props}>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
    </Icono>
  )
}

export function IconoDescargar(props: PropsIcono) {
  return (
    <Icono {...props}>
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
      <path d="M5 19.5h14" />
    </Icono>
  )
}

export function IconoFijar(props: PropsIcono) {
  return (
    <Icono {...props}>
      <path d="M9 4h6l-1 5 3.5 3.5H6.5L10 9z" />
      <path d="M12 12.5V20" />
    </Icono>
  )
}

/** Hecho: confirmación breve (p. ej. «copiado»). */
export function IconoHecho(props: PropsIcono) {
  return (
    <Icono {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Icono>
  )
}

export function IconoAdjuntar(props: PropsIcono) {
  return (
    <Icono {...props}>
      <path d="m19 11.5-7.2 7.2a4.5 4.5 0 0 1-6.4-6.4l7.5-7.5a3 3 0 0 1 4.2 4.2l-7.4 7.4a1.5 1.5 0 0 1-2.1-2.1l6.8-6.8" />
    </Icono>
  )
}

export function IconoCarrito(props: PropsIcono) {
  return (
    <Icono {...props}>
      <path d="M3 4.5h2.2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6.3" />
      <circle cx="9.5" cy="19.5" r="1.3" />
      <circle cx="17" cy="19.5" r="1.3" />
    </Icono>
  )
}

export function IconoPC(props: PropsIcono) {
  return (
    <Icono {...props}>
      <rect x="3" y="4.5" width="18" height="12" rx="1.5" />
      <path d="M9 20h6M12 16.5V20" />
    </Icono>
  )
}

/** Red de casa: router con ondas. */
export function IconoRed(props: PropsIcono) {
  return (
    <Icono {...props}>
      <rect x="3.5" y="14" width="17" height="6" rx="1.5" />
      <path d="M7 17h.01M10.5 17h.01" />
      <path d="M8.5 10.5a5 5 0 0 1 7 0M6 8a8.5 8.5 0 0 1 12 0" />
      <path d="M12 14v-1" />
    </Icono>
  )
}
