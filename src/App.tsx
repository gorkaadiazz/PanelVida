import { lazy, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Login } from './auth/Login'
import { useSesion } from './auth/useSesion'
import { AvisoActualizacion } from './components/AvisoActualizacion'
import { AvisoConexion } from './components/AvisoConexion'
import { AvisoSync } from './components/AvisoSync'
import { Layout } from './components/Layout'
import { LayoutFamilia } from './components/LayoutFamilia'
import { useTipoCuenta } from './auth/useTipoCuenta'
import { Inicio } from './pages/Inicio'

// Inicio va en el paquete principal (es lo primero que se ve). El resto de
// pantallas se descargan aparte al entrar en ellas; el service worker las
// guarda todas igualmente, así que sin conexión siguen abriendo.
const pagina = <N extends string>(carga: () => Promise<Record<N, () => React.JSX.Element>>, nombre: N) =>
  lazy(async () => ({ default: (await carga())[nombre] }))
const Habitos = pagina(() => import('./pages/Habitos'), 'Habitos')
const Tareas = pagina(() => import('./pages/Tareas'), 'Tareas')
const Estudios = pagina(() => import('./pages/Estudios'), 'Estudios')
const Dinero = pagina(() => import('./pages/Dinero'), 'Dinero')
const Negocio = pagina(() => import('./pages/Negocio'), 'Negocio')
const Mas = pagina(() => import('./pages/Mas'), 'Mas')
const Cuenta = pagina(() => import('./pages/Cuenta'), 'Cuenta')
const Cumpleanos = pagina(() => import('./pages/Cumpleanos'), 'Cumpleanos')
const Planes = pagina(() => import('./pages/Planes'), 'Planes')
const Deseos = pagina(() => import('./pages/Deseos'), 'Deseos')
const Ideas = pagina(() => import('./pages/Ideas'), 'Ideas')
const Puente = pagina(() => import('./pages/Puente'), 'Puente')
const Compra = pagina(() => import('./pages/Compra'), 'Compra')
const Mando = pagina(() => import('./pages/Mando'), 'Mando')
const Red = pagina(() => import('./pages/Red'), 'Red')
const CuentaFamilia = pagina(() => import('./pages/Cuenta'), 'CuentaFamilia')
const NoEncontrada = pagina(() => import('./pages/NoEncontrada'), 'NoEncontrada')

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
  const tipo = useTipoCuenta(sesion?.user.id ?? null)
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

  // Primera vez en este navegador: se espera a saber el tipo de cuenta
  if (!tipo) {
    return (
      <p role="status" className="visually-hidden">
        Cargando…
      </p>
    )
  }

  // La familia («solo lista»): la Lista de la compra se abre directamente
  if (tipo === 'solo_lista') {
    return (
      <Routes>
        <Route element={<LayoutFamilia />}>
          <Route path="compra" element={<Compra />} />
          <Route path="cuenta" element={<CuentaFamilia />} />
          <Route path="*" element={<Navigate to="/compra" replace />} />
        </Route>
      </Routes>
    )
  }

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
        <Route path="ideas" element={<Ideas />} />
        <Route path="cumpleanos" element={<Cumpleanos />} />
        <Route path="planes" element={<Planes />} />
        <Route path="deseos" element={<Deseos />} />
        <Route path="casa/puente" element={<Puente />} />
        <Route path="casa/mando" element={<Mando />} />
        <Route path="casa/red" element={<Red />} />
        <Route path="compra" element={<Compra />} />
        <Route path="cuenta" element={<Cuenta />} />
        <Route path="*" element={<NoEncontrada />} />
      </Route>
    </Routes>
  )
}
