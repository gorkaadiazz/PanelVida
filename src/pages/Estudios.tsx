import { Pagina } from '../components/Pagina'
import { Vacio } from '../components/Vacio'
import { IconoEstudios, IconoExterno } from '../components/iconos'
import { URL_EXAMENES } from '../lib/enlaces'

// La navegación ya enlaza directamente a la web de exámenes. Esta pantalla
// solo la ve quien llega a /estudios por un enlace guardado.
export function Estudios() {
  return (
    <Pagina titulo="Estudios">
      <Vacio
        icono={<IconoEstudios />}
        titulo="Tus estudios están en tu web de exámenes"
        accion={
          <a href={URL_EXAMENES} target="_blank" rel="noopener noreferrer" className="btn btn--primary">
            Abrir la web de exámenes
            <IconoExterno />
            <span className="visually-hidden"> (se abre en otra pestaña)</span>
          </a>
        }
      >
        Módulos, exámenes, notas por RA y faltas. Usa la misma cuenta que Mi Panel, y el próximo examen sale también en
        Inicio.
      </Vacio>
    </Pagina>
  )
}
