import { useState } from 'react'
import { nombreDeUsuario, useSesion } from '../auth/useSesion'
import { Pagina } from '../components/Pagina'
import { Vacio } from '../components/Vacio'
import { IconoInicio } from '../components/iconos'

const FORMATO_HOY = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Europe/Madrid',
})

export function Inicio() {
  const { usuario } = useSesion()
  const nombre = nombreDeUsuario(usuario).split(' ')[0]
  // Se calcula al abrir la pantalla (useState evita recalcular en cada render).
  const [hoy] = useState(() => FORMATO_HOY.format(new Date()))
  const hoyConMayuscula = hoy.charAt(0).toLocaleUpperCase('es-ES') + hoy.slice(1)

  return (
    <Pagina titulo="Inicio" encabezado={nombre ? `Hola, ${nombre}` : 'Hola'} subtitulo={hoyConMayuscula}>
      <Vacio icono={<IconoInicio />} titulo="Aquí verás tu día de un vistazo">
        Los hábitos de hoy, las tareas pendientes, el próximo examen y cómo va el mes.
      </Vacio>
    </Pagina>
  )
}
