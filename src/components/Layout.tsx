import { useEffect, useRef, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  IconoCuenta,
  IconoDinero,
  IconoEstudios,
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
}

const INICIO: Destino = { ruta: '/', texto: 'Inicio', icono: <IconoInicio /> }
const HABITOS: Destino = { ruta: '/habitos', texto: 'Hábitos', icono: <IconoHabitos /> }
const TAREAS: Destino = { ruta: '/tareas', texto: 'Tareas', icono: <IconoTareas /> }
const ESTUDIOS: Destino = { ruta: '/estudios', texto: 'Estudios', icono: <IconoEstudios /> }
const DINERO: Destino = { ruta: '/dinero', texto: 'Dinero', icono: <IconoDinero /> }
const NEGOCIO: Destino = { ruta: '/negocio', texto: 'Negocio', icono: <IconoNegocio /> }
const CUENTA: Destino = { ruta: '/cuenta', texto: 'Cuenta', icono: <IconoCuenta /> }
const MAS: Destino = { ruta: '/mas', texto: 'Más', icono: <IconoMas /> }

const PRINCIPALES = [INICIO, HABITOS, TAREAS, ESTUDIOS]
const EN_MAS = new Set([MAS.ruta, DINERO.ruta, NEGOCIO.ruta, CUENTA.ruta])

export function Layout() {
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const primeraVez = useRef(true)

  // Al cambiar de pantalla, el foco va al h1 (los lectores de pantalla
  // anuncian la página nueva). En la carga inicial no se mueve.
  useEffect(() => {
    if (primeraVez.current) {
      primeraVez.current = false
      return
    }
    mainRef.current?.querySelector<HTMLElement>('h1')?.focus()
  }, [pathname])

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Principal">
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
          <EnlaceLateral destino={CUENTA} />
        </div>
      </nav>

      <main className="app-main" ref={mainRef}>
        <Outlet />
      </main>

      <nav className="nav-bottom" aria-label="Principal">
        {PRINCIPALES.map((d) => (
          <EnlaceInferior key={d.ruta} destino={d} />
        ))}
        {/* "Más" sigue marcado cuando estás en Dinero, Negocio o Cuenta. */}
        <EnlaceInferior destino={MAS} activo={EN_MAS.has(pathname)} />
      </nav>
    </div>
  )
}

function EnlaceLateral({ destino }: { destino: Destino }) {
  return (
    <NavLink to={destino.ruta} end className="sidebar__item">
      {destino.icono}
      <span className="truncate">{destino.texto}</span>
    </NavLink>
  )
}

function EnlaceInferior({ destino, activo }: { destino: Destino; activo?: boolean }) {
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
