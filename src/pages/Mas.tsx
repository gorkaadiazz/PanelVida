import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Pagina } from '../components/Pagina'
import { IconoCuenta, IconoCumple, IconoDeseo, IconoDinero, IconoFlecha, IconoIdea, IconoNegocio, IconoCarrito, IconoPC, IconoPlan, IconoPuente } from '../components/iconos'

interface Enlace {
  ruta: string
  texto: string
  icono: ReactNode
}

// En bloques, como en la barra lateral: vida personal, casa, dinero y cuenta
const GRUPOS: { titulo?: string; enlaces: Enlace[] }[] = [
  {
    enlaces: [
      { ruta: '/ideas', texto: 'Ideas', icono: <IconoIdea /> },
      { ruta: '/cumpleanos', texto: 'Cumpleaños', icono: <IconoCumple /> },
      { ruta: '/planes', texto: 'Planes', icono: <IconoPlan /> },
      { ruta: '/deseos', texto: 'Lista de deseos', icono: <IconoDeseo /> },
    ],
  },
  {
    titulo: 'Casa',
    enlaces: [
      { ruta: '/compra', texto: 'Lista de la compra', icono: <IconoCarrito /> },
      { ruta: '/casa/puente', texto: 'Puente', icono: <IconoPuente /> },
      { ruta: '/casa/mando', texto: 'Mando del PC', icono: <IconoPC /> },
    ],
  },
  {
    enlaces: [
      { ruta: '/dinero', texto: 'Dinero', icono: <IconoDinero /> },
      { ruta: '/negocio', texto: 'Negocio', icono: <IconoNegocio /> },
      { ruta: '/cuenta', texto: 'Cuenta', icono: <IconoCuenta /> },
    ],
  },
]

export function Mas() {
  return (
    <Pagina titulo="Más">
      <div className="stack" style={{ '--gap': 'var(--sp-5)' } as CSSProperties}>
        {GRUPOS.map((g, i) => (
          <section key={g.titulo ?? i} aria-labelledby={g.titulo ? `mas-grupo-${i}` : undefined}>
            {g.titulo && (
              <h2 id={`mas-grupo-${i}`} className="t-section">
                {g.titulo}
              </h2>
            )}
            <ul className="list" role="list">
              {g.enlaces.map((e) => (
                <li key={e.ruta}>
                  <Link to={e.ruta} className="list__item">
                    {e.icono}
                    <span className="list__main">{e.texto}</span>
                    <IconoFlecha className="subtle" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Pagina>
  )
}
