import { Pagina } from '../components/Pagina'
import { Vacio } from '../components/Vacio'
import { IconoNegocio } from '../components/iconos'

export function Negocio() {
  return (
    <Pagina titulo="Negocio">
      <Vacio icono={<IconoNegocio />} titulo="Aquí estará tu negocio web">
        Clientes, proyectos y cobros de tus trabajos de webs.
      </Vacio>
    </Pagina>
  )
}
