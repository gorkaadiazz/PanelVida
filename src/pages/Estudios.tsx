import { Pagina } from '../components/Pagina'
import { Vacio } from '../components/Vacio'
import { IconoEstudios } from '../components/iconos'

export function Estudios() {
  return (
    <Pagina titulo="Estudios">
      <Vacio icono={<IconoEstudios />} titulo="Aquí estarán tus módulos de 2º SMR">
        Notas por RA, exámenes, faltas y apuntes de cada módulo.
      </Vacio>
    </Pagina>
  )
}
