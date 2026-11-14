import { Link } from 'react-router-dom'
import { Pagina } from '../components/Pagina'
import { IconoCuenta, IconoCumple, IconoDeseo, IconoDinero, IconoFlecha, IconoIdea, IconoNegocio, IconoPlan } from '../components/iconos'

const ENLACES = [
  { ruta: '/ideas', texto: 'Ideas', icono: <IconoIdea /> },
  { ruta: '/cumpleanos', texto: 'Cumpleaños', icono: <IconoCumple /> },
  { ruta: '/planes', texto: 'Planes', icono: <IconoPlan /> },
  { ruta: '/deseos', texto: 'Lista de deseos', icono: <IconoDeseo /> },
  { ruta: '/dinero', texto: 'Dinero', icono: <IconoDinero /> },
  { ruta: '/negocio', texto: 'Negocio', icono: <IconoNegocio /> },
  { ruta: '/cuenta', texto: 'Cuenta', icono: <IconoCuenta /> },
]

export function Mas() {
  return (
    <Pagina titulo="Más">
      <ul className="list" role="list">
        {ENLACES.map((e) => (
          <li key={e.ruta}>
            <Link to={e.ruta} className="list__item">
              {e.icono}
              <span className="list__main">{e.texto}</span>
              <IconoFlecha className="subtle" />
            </Link>
          </li>
        ))}
      </ul>
    </Pagina>
  )
}
