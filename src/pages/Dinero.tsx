import { Pagina } from '../components/Pagina'
import { Vacio } from '../components/Vacio'
import { IconoDinero } from '../components/iconos'

export function Dinero() {
  return (
    <Pagina titulo="Dinero">
      <Vacio icono={<IconoDinero />} titulo="Aquí estará tu dinero">
        Ingresos, gastos y ahorro del mes, en euros.
      </Vacio>
    </Pagina>
  )
}
