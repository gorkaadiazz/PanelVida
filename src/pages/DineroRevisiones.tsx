// Sección «Revisiones» de Dinero: las revisiones semanales y mensuales que la
// app hace sola (lib/revision.ts), la más reciente primero. Abrir una la marca
// como vista (deja de salir en Inicio).

import { useEffect, useId, useState, type CSSProperties } from 'react'
import { AvisoError } from '../components/AvisoError'
import { Vacio } from '../components/Vacio'
import { IconoDinero } from '../components/iconos'
import { formatearEuros, NOMBRE_CATEGORIA } from '../lib/dinero'
import { formatearFecha } from '../lib/fechas'
import { leerDatosRevision, nombrePeriodo, textoCambio, textoSugerencia, type DatosRevision, type Periodo, type TipoRevision } from '../lib/revision'
import { marcarVista, type Revision } from '../repos/revisiones'

type Ejecutar = (accion: () => Promise<unknown>) => Promise<boolean>

const mayuscula = (texto: string) => texto.replace(/^./, (c) => c.toLocaleUpperCase('es-ES'))

export function DineroRevisiones({ revisiones, ejecutar, cargando, error }: { revisiones: Revision[]; ejecutar: Ejecutar; cargando: boolean; error: boolean }) {
  if (error) return <AvisoError mensaje="No se han podido leer tus revisiones de este dispositivo. Recarga la página." />
  if (cargando && revisiones.length === 0) {
    return (
      <div className="stack" role="status" aria-busy="true" style={{ '--gap': 'var(--sp-2)' } as CSSProperties}>
        <span className="visually-hidden">Cargando tus revisiones…</span>
        <span className="skeleton" style={{ '--h': '6rem' } as CSSProperties} />
      </div>
    )
  }
  if (revisiones.length === 0) {
    return (
      <Vacio icono={<IconoDinero />} titulo="Aún no hay revisiones">
        Cada lunes se hace la de la semana anterior y el día 1, la del mes anterior, con lo que hayas apuntado. Sin IA: solo tus números.
      </Vacio>
    )
  }
  return (
    <div className="stack">
      <p className="t-small muted">Solo son sugerencias con tus números: las decisiones son tuyas.</p>
      {revisiones.map((r, i) => (
        <TarjetaRevision key={r.id} revision={r} abierta={i === 0 || !r.vista} ejecutar={ejecutar} />
      ))}
    </div>
  )
}

function TarjetaRevision({ revision: r, abierta: abrir, ejecutar }: { revision: Revision; abierta: boolean; ejecutar: Ejecutar }) {
  // Abierta o no solo al entrar: al marcarla como vista no se cierra sola
  const [abierta] = useState(abrir)
  const periodo: Periodo = { tipo: r.tipo as TipoRevision, inicio: r.inicio, fin: r.fin }
  const datos = leerDatosRevision(r.datos)

  // Se ve abierta al entrar: cuenta como vista (marcarVista no hace nada si ya lo está)
  useEffect(() => {
    if (abierta && !r.vista) void ejecutar(() => marcarVista(r.id))
  }, [abierta, r.vista, r.id, ejecutar])

  return (
    <details
      className="card revision"
      open={abierta}
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open && !r.vista) void ejecutar(() => marcarVista(r.id))
      }}
    >
      {/* Sin aria-describedby: las etiquetas ya forman parte del nombre del summary (se leían dos veces) */}
      <summary>
        <span className="t-section">{mayuscula(nombrePeriodo(periodo))}</span>
        <span className="row" style={{ '--gap': 'var(--sp-2)' } as CSSProperties}>
          <span className="tag">{r.tipo === 'semanal' ? 'Semana' : 'Mes'}</span>
          {!r.vista && <span className="tag tag--info">Nueva</span>}
        </span>
      </summary>
      {datos ? <DetalleRevision datos={datos} tipo={periodo.tipo} /> : <p className="t-small muted">Esta revisión se hizo con otra versión de la app y no se puede ver aquí.</p>}
    </details>
  )
}

function DetalleRevision({ datos: d, tipo }: { datos: DatosRevision; tipo: TipoRevision }) {
  const id = useId()
  const ese = tipo === 'semanal' ? 'la semana anterior' : 'el mes anterior'
  const ahorro = d.ingresos - d.gastos
  const conGasto = d.categorias.filter((c) => c.actual > 0 || c.anterior > 0)

  return (
    <div className="stack revision__cuerpo" style={{ '--gap': 'var(--sp-5)' } as CSSProperties}>
      <dl className="cifras">
        <dt>Gastos</dt>
        <dd>
          <span className="num">{formatearEuros(d.gastos)}</span> <span className="t-small muted">{textoCambio(d.gastos, d.gastos_anterior)} frente a {ese}</span>
        </dd>
        <dt>Ingresos</dt>
        <dd className="num">{formatearEuros(d.ingresos)}</dd>
        <dt>Ahorro</dt>
        <dd className={`num${ahorro < 0 ? ' text-danger' : ''}`}>{formatearEuros(ahorro)}</dd>
        <dt>Gastos fijos</dt>
        <dd>
          <span className="num">{formatearEuros(d.fijos_mes)}</span>
          <span className="t-small muted">/mes</span>
        </dd>
        <dt>Prescindibles</dt>
        <dd className="num">{formatearEuros(d.prescindibles)}</dd>
      </dl>

      {conGasto.length > 0 && (
        <section aria-labelledby={`${id}-cat`}>
          <h3 id={`${id}-cat`} className="t-label">
            Por categoría
          </h3>
          <ul className="list" role="list">
            {conGasto.map((c) => (
              <li key={c.categoria ?? 'sin'} className="list__item revision__fila">
                <span className="list__main">{c.categoria ? NOMBRE_CATEGORIA[c.categoria] : 'Sin categoría'}</span>
                <span className="num">{formatearEuros(c.actual)}</span>
                <span className={`t-small revision__cambio${c.actual !== c.anterior ? ' num' : ''}${c.actual > c.anterior ? ' text-warn' : ' muted'}`}>{textoCambio(c.actual, c.anterior)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby={`${id}-meta`}>
        <h3 id={`${id}-meta`} className="t-label">
          Ahorro y metas
        </h3>
        <p>
          Ahorro total <span className="num">{formatearEuros(d.ahorro_total)}</span> · ritmo{' '}
          <span className={`num${d.ritmo < 0 ? ' text-danger' : ''}`}>{formatearEuros(d.ritmo)}</span>/mes
        </p>
        {d.meta !== null && (
          <p className="t-small muted">
            {d.ahorro_total >= d.meta ? (
              <>
                Meta de <span className="num">{formatearEuros(d.meta)}</span> conseguida.
              </>
            ) : (
              <>
                Te faltan <span className="num">{formatearEuros(d.meta - d.ahorro_total)}</span> para tu meta.{' '}
                {d.llegada_meta ? (
                  <>
                    A ese ritmo llegabas el <span className="num">{formatearFecha(d.llegada_meta)}</span>.
                  </>
                ) : (
                  'A ese ritmo no llegabas.'
                )}
              </>
            )}
          </p>
        )}
        {d.deseos.length > 0 && (
          <ul className="t-small muted revision__deseos">
            {d.deseos.map((x, i) => (
              <li key={i}>
                <span className="break">{x.articulo}</span>: te faltan <span className="num">{formatearEuros(x.falta)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={`${id}-sug`}>
        <h3 id={`${id}-sug`} className="t-label">
          Dónde podrías recortar
        </h3>
        {d.sugerencias.length === 0 ? (
          <p className="t-small muted">Nada que destacar esta vez.</p>
        ) : (
          <ul className="revision__sugerencias">
            {d.sugerencias.map((s, i) => (
              <li key={i} className="break">
                {textoSugerencia(s, tipo)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
