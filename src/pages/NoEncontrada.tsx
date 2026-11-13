import { Link } from 'react-router-dom'
import { Pagina } from '../components/Pagina'
import { Vacio } from '../components/Vacio'
import { IconoAviso } from '../components/iconos'

export function NoEncontrada() {
  return (
    <Pagina titulo="Página no encontrada">
      <Vacio
        icono={<IconoAviso />}
        titulo="Esta página no existe"
        accion={<Link to="/" className="btn btn--secondary">Volver a Inicio</Link>}
      >
        Puede que el enlace esté mal escrito.
      </Vacio>
    </Pagina>
  )
}
