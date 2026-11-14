import type { CSSProperties } from 'react'
import { formatearEuros, type GastoCategoria } from '../lib/dinero'

/**
 * En qué se va el dinero del mes: una fila por categoría, de más a menos, con
 * su importe, su porcentaje y una barra (un solo color: la barra solo repite
 * el porcentaje que ya va escrito, no hace falta leyenda).
 */
export function GastosPorCategoria({ gastos }: { gastos: GastoCategoria[] }) {
  if (gastos.length === 0) return <p className="t-small muted">Sin gastos este mes.</p>
  return (
    <ul className="categorias" role="list">
      {gastos.map((g) => (
        <li key={g.categoria ?? 'sin'} className="categorias__fila">
          <span className={g.categoria ? undefined : 'muted'}>{g.nombre}</span>
          <span className="num">
            {formatearEuros(g.total)} <span className="muted">· {g.porcentaje} %</span>
          </span>
          <div className="progress progress--grafica" aria-hidden="true" style={{ '--p': `${g.porcentaje}%` } as CSSProperties} />
        </li>
      ))}
    </ul>
  )
}
