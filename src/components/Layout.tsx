import { Suspense, useEffect, useRef, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { URL_EXAMENES } from '../lib/enlaces'
import { EstadoSincronizacion } from './EstadoSincronizacion'
import {
  IconoCuenta,
  IconoDinero,
  IconoEstudios,
  IconoExterno,
  IconoHabitos,
  IconoInicio,
  IconoMas,
  IconoNegocio,
  IconoTareas,
} from './iconos'

interface Destino {
  ruta: string
  texto: string
  icono: ReactNode
  /** Enlace a otra web: se abre en otra pestaña. */
  externo?: boolean
}

const INICIO: Destino = { ruta: '/', texto: 'Inicio', icono: <IconoInicio /> }
const HABITOS: Destino = { ruta: '/habitos', texto: 'Hábitos', icono: <IconoHabitos /> }
const TAREAS: Destino = { ruta: '/tareas', texto: 'Tareas', icono: <IconoTareas /> }
// Los estudios se llevan en la web de exámenes (misma cuenta): es un enlace a ella
const ESTUDIOS: Destino = { ruta: URL_EXAMENES, texto: 'Estudios', icono: <IconoEstudios />, externo: true }
const DINERO: Destino = { ruta: '/dinero', texto: 'Dinero', icono: <IconoDinero /> }
const NEGOCIO: Destino = { ruta: '/negocio', texto: 'Negocio', icono: <IconoNegocio /> }
const CUENTA: Destino = { ruta: '/cuenta', texto: 'Cuenta', icono: <IconoCuenta /> }
const MAS: Destino = { ruta: '/mas', texto: 'Más', icono: <IconoMas /> }

const PRINCIPALES = [INICIO, HABITOS, TAREAS, ESTUDIOS]
const EN_MAS = new Set([MAS.ruta, DINERO.ruta, NEGOCIO.ruta, CUENTA.ruta])

export function Layout() {
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const rutaAnterior = useRef(pathname)

  // Al cambiar de pantalla, el foco va al h1 (los lectores de pantalla
  // anuncian la página nueva). En la carga inicial no se mueve: se compara con
  // la ruta anterior (y no con un "primera vez") para que StrictMode, que
  // ejecuta el efecto dos veces en desarrollo, no lo mueva por error.
  useEffect(() => {
    if (rutaAnterior.current === pathname) return
    rutaAnterior.current = pathname
    mainRef.current?.querySelector<HTMLElement>('h1')?.focus()
  }, [pathname])

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Navegación lateral">
        <div className="sidebar__brand">
          <img src="/icons/icono.svg" alt="" width={28} height={28} />
          <span>Mi Panel</span>
        </div>
        {PRINCIPALES.map((d) => (
          <EnlaceLateral key={d.ruta} destino={d} />
        ))}
        <div className="sidebar__group">
          <EnlaceLateral destino={DINERO} />
          <EnlaceLateral destino={NEGOCIO} />
        </div>
        <div className="sidebar__foot">
          <p className="sidebar__sync">
            <EstadoSincronizacion />
          </p>
          <EnlaceLateral destino={CUENTA} />
        </div>
      </nav>

      <main className="app-main" ref={mainRef}>
        {/* Las pantallas se cargan aparte (App.tsx): mientras llega una, solo un aviso para lectores de pantalla */}
        <Suspense
          fallback={
            <p role="status" className="visually-hidden">
              Cargando…
            </p>
          }
        >
          <Outlet />
        </Suspense>
      </main>

      <nav className="nav-bottom" aria-label="Navegación inferior">
        {PRINCIPALES.map((d) => (
          <EnlaceInferior key={d.ruta} destino={d} />
        ))}
        {/* "Más" sigue marcado cuando estás en Dinero, Negocio o Cuenta. */}
        <EnlaceInferior destino={MAS} activo={EN_MAS.has(pathname)} />
      </nav>
    </div>
  )
}

// Sale de la app: lleva la flecha de salida (visible) y el aviso de pestaña
// nueva (para el lector de pantalla).
function EnlaceExterno({ destino, lugar }: { destino: Destino; lugar: 'lateral' | 'inferior' }) {
  const marca = <IconoExterno className="enlace-externo__marca" />
  if (lugar === 'inferior') {
    return (
      <a href={destino.ruta} target="_blank" rel="noopener noreferrer" className="nav-bottom__item">
        <span className="nav-bottom__icon">
          {destino.icono}
          {marca}
        </span>
        <span>{destino.texto}</span>
        <span className="visually-hidden"> (se abre en otra pestaña)</span>
      </a>
    )
  }
  return (
    <a href={destino.ruta} target="_blank" rel="noopener noreferrer" className="sidebar__item">
      {destino.icono}
      <span className="truncate">{destino.texto}</span>
      {marca}
      <span className="visually-hidden"> (se abre en otra pestaña)</span>
    </a>
  )
}

function EnlaceLateral({ destino }: { destino: Destino }) {
  if (destino.externo) return <EnlaceExterno destino={destino} lugar="lateral" />
  return (
    <NavLink to={destino.ruta} end className="sidebar__item">
      {destino.icono}
      <span className="truncate">{destino.texto}</span>
    </NavLink>
  )
}

function EnlaceInferior({ destino, activo }: { destino: Destino; activo?: boolean }) {
  if (destino.externo) return <EnlaceExterno destino={destino} lugar="inferior" />
  const contenido = (
    <>
      <span className="nav-bottom__icon">{destino.icono}</span>
      <span>{destino.texto}</span>
    </>
  )
  // "Más" se marca como activo también en Dinero, Negocio y Cuenta, así que
  // su aria-current se calcula aquí; el resto lo pone NavLink.
  if (activo !== undefined) {
    return (
      <Link to={destino.ruta} className="nav-bottom__item" aria-current={activo ? 'page' : undefined}>
        {contenido}
      </Link>
    )
  }
  return (
    <NavLink to={destino.ruta} end className="nav-bottom__item">
      {contenido}
    </NavLink>
  )
}
