import { formatearEuros } from '../lib/dinero'
import { diferenciaDias, formatearFecha, type FechaDia } from '../lib/fechas'
import type { Punto } from '../lib/prevision'

// Ahorro total: la evolución real hasta hoy (línea continua) y la previsión
// (línea discontinua), con la meta como línea horizontal. Una sola serie y un
// solo color (--grafica): lo real y lo previsto se distinguen por el trazo,
// no por el color. Los textos van en HTML (no encogen con el SVG) y, para
// lectores de pantalla, una tabla con todos los puntos.

const ANCHO = 320
const ALTO = 140
const MARGEN = 8

export function GraficaPrevision({ real, prevision, meta }: { real: Punto[]; prevision: Punto[]; meta: number | null }) {
  const todos = [...real, ...prevision]
  if (todos.length < 2) return null
  const inicio = todos[0].fecha
  const fin = todos[todos.length - 1].fecha
  const totalDias = Math.max(1, diferenciaDias(inicio, fin))
  const valores = [...todos.map((p) => p.saldo), ...(meta !== null ? [meta] : []), 0]
  const min = Math.min(...valores)
  const max = Math.max(...valores)
  const rango = max - min || 1
  const x = (fecha: FechaDia) => (diferenciaDias(inicio, fecha) / totalDias) * ANCHO
  const y = (valor: number) => MARGEN + (1 - (valor - min) / rango) * (ALTO - 2 * MARGEN)
  const linea = (puntos: Punto[]) => puntos.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.fecha).toFixed(1)},${y(p.saldo).toFixed(1)}`).join(' ')
  const hoy = prevision[0]?.fecha ?? real[real.length - 1]?.fecha
  const ultimo = prevision[prevision.length - 1] ?? real[real.length - 1]

  return (
    <figure className="grafica prevision-grafica">
      <p className="grafica__lectura" aria-hidden="true">
        <span className="t-small muted">El {formatearFecha(ultimo.fecha)}</span>
        <span className={`num grafica__valor${ultimo.saldo < 0 ? ' text-danger' : ''}`}>{formatearEuros(ultimo.saldo)}</span>
      </p>
      <svg className="grafica__svg" viewBox={`0 0 ${ANCHO} ${ALTO}`} aria-hidden="true" focusable="false">
        {min < 0 && <line className="grafica__cero" x1={0} x2={ANCHO} y1={y(0)} y2={y(0)} />}
        {meta !== null && <line className="prevision-grafica__meta" x1={0} x2={ANCHO} y1={y(meta)} y2={y(meta)} />}
        {hoy && <line className="prevision-grafica__hoy" x1={x(hoy)} x2={x(hoy)} y1={0} y2={ALTO} />}
        {real.length > 1 && <path className="prevision-grafica__real" d={linea(real)} />}
        {prevision.length > 1 && <path className="prevision-grafica__prevista" d={linea(prevision)} />}
      </svg>
      <div className="prevision-grafica__ejes t-small muted" aria-hidden="true">
        <span className="num">{formatearFecha(inicio)}</span>
        <span className="num">{formatearFecha(fin)}</span>
      </div>
      <figcaption className="t-small muted prevision-grafica__leyenda">
        <span className="prevision-grafica__clave prevision-grafica__clave--real" aria-hidden="true" /> Ahorro real
        <span className="prevision-grafica__clave prevision-grafica__clave--prevista" aria-hidden="true" /> Previsión (desde hoy, la línea vertical)
        {meta !== null && (
          <>
            <span className="prevision-grafica__clave prevision-grafica__clave--meta" aria-hidden="true" /> Meta (<span className="num">{formatearEuros(meta)}</span>)
          </>
        )}
      </figcaption>
      <div className="visually-hidden">
        <table>
          <caption>Ahorro total real y previsto</caption>
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Ahorro total</th>
            </tr>
          </thead>
          <tbody>
            {real.map((p) => (
              <tr key={`r${p.fecha}`}>
                <th scope="row">{formatearFecha(p.fecha)}</th>
                <td>{formatearEuros(p.saldo)}</td>
              </tr>
            ))}
            {prevision.slice(1).map((p) => (
              <tr key={`p${p.fecha}`}>
                <th scope="row">{formatearFecha(p.fecha)} (previsión)</th>
                <td>{formatearEuros(p.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}
