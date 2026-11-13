import { useState } from 'react'
import { formatearEuros, type BarraMes } from '../lib/dinero'

// Ahorro (ingresos − gastos) de los últimos meses: una barra por mes que sube
// o baja desde la línea de cero. Una sola serie y un solo color (--grafica);
// el signo lo dice la posición, no el color. El importe solo se escribe en
// el mes senalado (el actual, o el que tenga el ratón o el dedo encima).
// Para lectores de pantalla hay una tabla con todos los datos.

const ANCHO = 320
const ALTO = 150
const ARRIBA = 22 // sitio para el importe sobre la barra
const ABAJO = 24 // sitio para el nombre del mes
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

export function GraficaAhorro({ meses }: { meses: BarraMes[] }) {
  const [senalado, setSenalado] = useState<number | null>(null)
  const actual = meses.length - 1
  const indice = senalado ?? actual

  const maxPos = Math.max(0, ...meses.map((m) => m.ahorro))
  const maxNeg = Math.max(0, ...meses.map((m) => -m.ahorro))
  const rango = maxPos + maxNeg
  const altoUtil = ALTO - ARRIBA - ABAJO
  // Línea de cero: abajo del todo si no hay meses en negativo
  const cero = ARRIBA + (rango ? (maxPos / rango) * altoUtil : altoUtil)
  const y = (valor: number) => (rango ? cero - (valor / rango) * altoUtil : cero)
  const hueco = ANCHO / Math.max(1, meses.length)

  const marcado = meses[indice]

  return (
    <figure className="grafica">
      <svg
        className="grafica__svg"
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        aria-hidden="true"
        focusable="false"
        onPointerLeave={() => setSenalado(null)}
      >
        <line className="grafica__cero" x1={0} x2={ANCHO} y1={cero} y2={cero} />
        {meses.map((m, i) => {
          const x = i * hueco + (hueco - BARRA) / 2
          const yv = y(m.ahorro)
          const esMarcado = i === indice
          return (
            <g key={m.mes} onPointerEnter={() => setSenalado(i)} onPointerDown={() => setSenalado(i)}>
              {/* Zona sensible: toda la columna, más grande que la barra */}
              <rect className="grafica__zona" x={i * hueco} y={0} width={hueco} height={ALTO} />
              <path className={`grafica__barra${esMarcado ? ' grafica__barra--marcada' : ''}`} d={barra(x, cero, yv)} />
              {esMarcado && (
                <text
                  className="grafica__valor"
                  x={Math.min(Math.max(x + BARRA / 2, 36), ANCHO - 36)}
                  y={m.ahorro >= 0 ? yv - 7 : Math.min(yv + 15, ALTO - ABAJO + 12)}
                  textAnchor="middle"
                >
                  {formatearEuros(m.ahorro)}
                </text>
              )}
              <text
                className={`grafica__mes${i === actual ? ' grafica__mes--actual' : ''}`}
                x={i * hueco + hueco / 2}
                y={ALTO - 6}
                textAnchor="middle"
              >
                {m.etiqueta}
              </text>
            </g>
          )
        })}
      </svg>
      <figcaption className="t-small muted" aria-hidden="true">
        {marcado ? `Ahorro de ${marcado.nombre}` : ''}
      </figcaption>

      <table className="visually-hidden">
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
    </figure>
  )
}
