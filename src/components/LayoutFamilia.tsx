// Esqueleto para una cuenta «solo lista» (la familia): sin barra de
// navegación, solo la Lista de la compra y Cuenta (para cerrar sesión).
// Ocultar el resto no es la seguridad: eso lo hacen las políticas RLS
// restrictivas de la base de datos.

import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { EstadoSincronizacion } from './EstadoSincronizacion'
import { IconoCarrito, IconoCuenta } from './iconos'

export function LayoutFamilia() {
  return (
    <div className="app app--familia">
      <header className="familia-barra">
        <span className="familia-barra__marca">
          <img src="/icons/icono.svg" alt="" width={24} height={24} />
          Mi Panel
        </span>
        <nav className="familia-barra__nav" aria-label="Navegación">
          <NavLink to="/compra" className="familia-barra__item">
            <IconoCarrito />
            <span>Lista</span>
          </NavLink>
          <NavLink to="/cuenta" className="familia-barra__item">
            <IconoCuenta />
            <span>Cuenta</span>
          </NavLink>
        </nav>
      </header>
      <main className="app-main app-main--familia">
        <p className="t-small muted familia-sync">
          <EstadoSincronizacion />
        </p>
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
    </div>
  )
}
