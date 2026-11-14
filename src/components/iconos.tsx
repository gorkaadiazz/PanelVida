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
