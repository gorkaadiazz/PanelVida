import { useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Login } from './auth/Login'
import { useSesion } from './auth/useSesion'
import { AvisoActualizacion } from './components/AvisoActualizacion'
import { AvisoConexion } from './components/AvisoConexion'
import { AvisoSync } from './components/AvisoSync'
import { Layout } from './components/Layout'
import { Cuenta } from './pages/Cuenta'
import { Dinero } from './pages/Dinero'
import { Estudios } from './pages/Estudios'
import { Habitos } from './pages/Habitos'
import { Inicio } from './pages/Inicio'
import { Mas } from './pages/Mas'
import { Negocio } from './pages/Negocio'
import { NoEncontrada } from './pages/NoEncontrada'
import { Tareas } from './pages/Tareas'

export default function App({ errorInicial }: { errorInicial: string | null }) {
  return (
    <>
      <Contenido errorInicial={errorInicial} />
      <div className="avisos">
        <AvisoConexion />
        <AvisoSync />
        <AvisoActualizacion />
      </div>
    </>
  )
}

function Contenido({ errorInicial }: { errorInicial: string | null }) {
  const { cargando, sesion } = useSesion()
  // El error de vuelta de Google solo vale para este intento de login: en
  // cuanto hay sesión se descarta, para que no reaparezca al cerrar sesión.
  const [errorPendiente, setErrorPendiente] = useState(errorInicial)
  if (sesion && errorPendiente) setErrorPendiente(null)

  // Mientras se lee la sesión guardada (suele ser instantáneo) no se pinta
  // nada visible: así no parpadea Login antes de entrar.
  if (cargando) {
    return (
      <p role="status" className="visually-hidden">
        Cargando…
      </p>
    )
  }

  if (!sesion) return <Login errorInicial={errorPendiente} />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Inicio />} />
        <Route path="habitos" element={<Habitos />} />
        <Route path="tareas" element={<Tareas />} />
        <Route path="estudios" element={<Estudios />} />
        <Route path="dinero" element={<Dinero />} />
        <Route path="negocio" element={<Negocio />} />
        <Route path="mas" element={<Mas />} />
        <Route path="cuenta" element={<Cuenta />} />
        <Route path="*" element={<NoEncontrada />} />
      </Route>
    </Routes>
  )
}
