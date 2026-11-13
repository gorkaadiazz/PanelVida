import { Pagina } from '../components/Pagina'
import { Vacio } from '../components/Vacio'
import { IconoHabitos } from '../components/iconos'

export function Habitos() {
  return (
    <Pagina titulo="Hábitos">
      <Vacio icono={<IconoHabitos />} titulo="Aquí estarán tus hábitos">
        Marcarás cada día lo que has hecho y verás tu racha semana a semana.
      </Vacio>
    </Pagina>
  )
}
