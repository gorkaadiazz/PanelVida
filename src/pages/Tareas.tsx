import { Pagina } from '../components/Pagina'
import { Vacio } from '../components/Vacio'
import { IconoTareas } from '../components/iconos'

export function Tareas() {
  return (
    <Pagina titulo="Tareas">
      <Vacio icono={<IconoTareas />} titulo="Aquí estarán tus tareas">
        Apuntarás lo que tienes pendiente, con fecha si la tiene, y lo tacharás al acabar.
      </Vacio>
    </Pagina>
  )
}
