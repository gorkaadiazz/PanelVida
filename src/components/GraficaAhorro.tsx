import { useState, type CSSProperties } from 'react'
import { formatearEuros, type BarraMes } from '../lib/dinero'

// Ahorro (ingresos − gastos) de los últimos meses: una barra por mes que sube
// o baja desde la línea de cero. Una sola serie y un solo color (--grafica);
// el signo lo dice la posición (y el pie lo explica), no el color.
//
// El SVG solo dibuja barras y la línea de cero. Los textos van en HTML para
// que no encojan con el SVG (a 360 px quedaban por debajo de 12 px) y no se
// pisen: arriba, la lectura del mes señalado; abajo, un botón por mes
// (44 px, teclado y dedo) que lo señala. Para lectores de pantalla, cada
// botón dice su importe y hay una tabla con todos los datos.

const ANCHO = 320
const ALTO = 120
const MARGEN = 6 // aire arriba y abajo para que la barra más alta no toque el borde
const BARRA = 22
const RADIO = 4

/** Rectángulo con las esquinas redondeadas solo en el extremo del dato. */
function barra(x: number, y0: number, y1: number): string {
  const alto = Math.abs(y1 - y0)
  if (alto < 0.5) return ''
  const r = Math.min(RADIO, alto, BARRA / 2)
  const arriba = y1 < y0 // barra positiva: el dato está arriba
  const [base, punta] = [y0, y1]
  const d = arriba ? 1 : -1 // hacia dónde está la base vista desde la punta
  return [
    `M${x},${base}`,
    `V${punta + d * r}`,
    `Q${x},${punta} ${x + r},${punta}`,
    `H${x + BARRA - r}`,
    `Q${x + BARRA},${punta} ${x + BARRA},${punta + d * r}`,
    `V${base}`,
    'Z',
  ].join(' ')
}

const mayuscula = (texto: string) => texto.replace(/^./, (c) => c.toLocaleUpperCase('es-ES'))

export function GraficaAhorro({ meses }: { meses: BarraMes[] }) {
  const [senalado, setSenalado] = useState<number | null>(null)
  const actual = meses.length - 1
  const indice = senalado ?? actual
  const marcado = meses[indice]

  if (meses.length === 0 || meses.every((m) => m.ingresos === 0 && m.gastos === 0)) {
    return <p className="t-small muted grafica__vacia">Sin movimientos en estos {meses.length} meses: la gráfica aparecerá cuando apuntes alguno.</p>
  }

  const maxPos = Math.max(0, ...meses.map((m) => m.ahorro))
  const maxNeg = Math.max(0, ...meses.map((m) => -m.ahorro))
  const rango = maxPos + maxNeg
  const altoUtil = ALTO - 2 * MARGEN
  // Línea de cero: abajo del todo si no hay meses en negativo
  const cero = MARGEN + (rango ? (maxPos / rango) * altoUtil : altoUtil)
  const y = (valor: number) => (rango ? cero - (valor / rango) * altoUtil : cero)
  const hueco = ANCHO / meses.length

  return (
    <figure className="grafica" style={{ '--n': meses.length } as CSSProperties}>
      <p className="grafica__lectura" aria-hidden="true">
        <span className="t-small muted">{marcado ? mayuscula(marcado.nombre) : ''}</span>
        {marcado && <span className={`num grafica__valor${marcado.ahorro < 0 ? ' text-danger' : ''}`}>{formatearEuros(marcado.ahorro)}</span>}
      </p>

      <svg
        className="grafica__svg"
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        aria-hidden="true"
        focusable="false"
        // Solo el ratón vuelve al mes actual al salir: con el dedo, pointerleave
        // llega justo al levantarlo y el mes tocado no se llegaría a leer.
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') setSenalado(null)
        }}
      >
        <line className="grafica__cero" x1={0} x2={ANCHO} y1={cero} y2={cero} />
        {meses.map((m, i) => {
          const x = i * hueco + (hueco - BARRA) / 2
          return (
            <g key={m.mes} onPointerEnter={() => setSenalado(i)} onPointerDown={() => setSenalado(i)}>
              {/* Zona sensible: toda la columna, más grande que la barra */}
              <rect className="grafica__zona" x={i * hueco} y={0} width={hueco} height={ALTO} />
              <path className={`grafica__barra${i === indice ? ' grafica__barra--marcada' : ''}`} d={barra(x, cero, y(m.ahorro))} />
            </g>
          )
        })}
      </svg>

      <div className="grafica__meses">
        {meses.map((m, i) => (
          <button
            key={m.mes}
            type="button"
            className={`grafica__mes${i === actual ? ' grafica__mes--actual' : ''}`}
            aria-pressed={i === indice}
            aria-label={`${m.nombre}: ${formatearEuros(m.ahorro)}`}
            onClick={() => setSenalado(i)}
          >
            {m.etiqueta}
          </button>
        ))}
      </div>

      <figcaption className="t-small muted">
        Cada barra es lo que ahorraste ese mes (ingresos menos gastos).
        {maxNeg > 0 && ' Las que bajan de la línea son meses en que gastaste más de lo que ingresaste.'}
      </figcaption>

      {/* El contenedor oculto, y no la tabla: una tabla no encoge por debajo de
          su contenido y se salía de la pantalla a 360 px (scroll horizontal) */}
      <div className="visually-hidden">
      <table>
        <caption>Ahorro de los últimos {meses.length} meses</caption>
        <thead>
          <tr>
            <th scope="col">Mes</th>
            <th scope="col">Ingresos</th>
            <th scope="col">Gastos</th>
            <th scope="col">Ahorro</th>
          </tr>
        </thead>
        <tbody>
          {meses.map((m) => (
            <tr key={m.mes}>
              <th scope="row">{m.nombre}</th>
              <td>{formatearEuros(m.ingresos)}</td>
              <td>{formatearEuros(m.gastos)}</td>
              <td>{formatearEuros(m.ahorro)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </figure>
  )
}
