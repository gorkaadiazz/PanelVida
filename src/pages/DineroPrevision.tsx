// Sección «Previsión» de Dinero (sin IA): el ritmo al que ahorras de verdad,
// cuánto tendrás en un plazo, cuándo llegas a una cantidad, tres escenarios y
// la gráfica con lo real y lo previsto. Todo sale de lib/prevision.ts.

import { useId, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { AvisoError } from '../components/AvisoError'
import { GraficaPrevision } from '../components/GraficaPrevision'
import { useHoy } from '../components/useHoy'
import { guardarVentana, leerVentana } from '../components/ventanaPrevision'
import { formatearEuros, parsearImporte } from '../lib/dinero'
import { ordenarDeseos } from '../lib/deseos'
import { diferenciaDias, formatearFecha, type FechaDia } from '../lib/fechas'
import {
  ahorroTotal,
  cuandoLlego,
  objetivoDeseo,
  ritmoAhorro,
  saldoEn,
  serieProyeccion,
  serieReal,
  sumarMesesAFecha,
  textoFecha,
  textoLlegada,
  textoRitmo,
  VENTANAS,
  type Ventana,
} from '../lib/prevision'
import { ahorroDeRecortes, leerDatosRevision } from '../lib/revision'
import { useDeseos, useFijos, useMovimientos, usePerfil, useRevisiones } from '../repos/hooks'
import { useEstadoSync } from '../sync/hooks'

type Escenario = 'actual' | 'recortes' | 'ajustable'
const PLAZOS = [1, 3, 6, 12] as const
/** El control «ahorrar X € más o menos al mes»: de −500 € a +500 €, de 10 en 10. */
const AJUSTE_MAX = 50000
const AJUSTE_PASO = 1000
/** Meses que enseña la gráfica hacia delante como mucho. */
const MAX_MESES_GRAFICA = 36

export function DineroPrevision() {
  const hoy = useHoy()
  const id = useId()
  const movimientos = useMovimientos()
  const fijos = useFijos()
  const perfil = usePerfil()
  const deseos = useDeseos()
  const revisiones = useRevisiones()
  const { primeraDescargaHecha } = useEstadoSync()

  const [ventana, setVentana] = useState<Ventana>(leerVentana)
  const [escenario, setEscenario] = useState<Escenario>('actual')
  const [ajuste, setAjuste] = useState(0)
  const [plazo, setPlazo] = useState<string>('6')
  const [fecha, setFecha] = useState('')
  const [objetivo, setObjetivo] = useState('meta')
  const [cantidad, setCantidad] = useState('')

  const lista = movimientos.datos ?? []
  const cargando = movimientos.cargando || (lista.length === 0 && !primeraDescargaHecha)
  if (movimientos.error) return <AvisoError mensaje="No se han podido leer tus movimientos de este dispositivo. Recarga la página." />
  if (cargando && lista.length === 0) {
    return (
      <div className="stack" role="status" aria-busy="true" style={{ '--gap': 'var(--sp-2)' } as CSSProperties}>
        <span className="visually-hidden">Cargando tu previsión…</span>
        <span className="skeleton" style={{ '--h': '6rem' } as CSSProperties} />
        <span className="skeleton" style={{ '--h': '10rem' } as CSSProperties} />
      </div>
    )
  }

  const listaFijos = fijos.datos ?? []
  const ritmo = ritmoAhorro(lista, listaFijos, ventana, hoy)
  const saldo = ahorroTotal(lista)
  const meta = perfil.datos?.meta_ahorro_centimos ?? null

  // Escenarios
  const ultima = (revisiones.datos ?? []).map((r) => leerDatosRevision(r.datos)).find((d) => d !== null) ?? null
  const recortes = ultima ? ahorroDeRecortes(ultima.sugerencias) : 0
  const ritmoDe: Record<Escenario, number> = { actual: ritmo.mensual, recortes: ritmo.mensual + recortes, ajustable: ritmo.mensual + ajuste }
  const elegido = escenario === 'recortes' && recortes === 0 ? 'actual' : escenario
  const r = ritmoDe[elegido]

  // ¿Cuánto tendré en…?
  const fechaPlazo: FechaDia | null = plazo === 'fecha' ? (fecha && fecha > hoy ? fecha : null) : sumarMesesAFecha(hoy, Number(plazo))
  const tendras = fechaPlazo ? saldoEn(saldo, r, hoy, fechaPlazo) : null

  // ¿Cuándo llego a…?
  const pendientes = ordenarDeseos((deseos.datos ?? []).filter((d) => !d.comprado))
  let cifraObjetivo: number | null = null
  let errorCantidad: string | null = null
  if (objetivo === 'meta') cifraObjetivo = meta
  else if (objetivo.startsWith('deseo:')) cifraObjetivo = objetivoDeseo(deseos.datos ?? [], objetivo.slice(6))
  else if (cantidad.trim()) {
    try {
      cifraObjetivo = parsearImporte(cantidad)
    } catch (e) {
      errorCantidad = (e as Error).message
    }
  }
  const llegada = cifraObjetivo !== null ? cuandoLlego(saldo, cifraObjetivo, r, hoy) : null

  // Gráfica: hasta el plazo elegido, o hasta la llegada si se ve antes (entre 3 y 36 meses)
  const mesesHasta = (f: FechaDia) => Math.ceil(diferenciaDias(hoy, f) / 30.4)
  const horizonte = Math.min(
    MAX_MESES_GRAFICA,
    Math.max(3, fechaPlazo ? mesesHasta(fechaPlazo) : 6, llegada?.estado === 'llega' ? mesesHasta(llegada.fecha) : 0),
  )

  return (
    <div className="stack">
      <section className="card" aria-labelledby={`${id}-ritmo`}>
        <div className="card__head">
          <h2 id={`${id}-ritmo`} className="card__titulo">
            Tu ritmo de ahorro
          </h2>
        </div>
        <p className={`num num--xl${ritmo.mensual < 0 ? ' text-danger' : ''}`}>{textoRitmo(ritmo.mensual)}</p>
        <p className="t-small muted" style={{ marginTop: 'var(--sp-2)' }}>
          Lo que apuntas a mano: <span className="num">{textoRitmo(ritmo.variable)}</span> de media · fijos: <span className="num">{textoRitmo(ritmo.fijos)}</span>. Ahorro total hoy:{' '}
          <span className="num">{formatearEuros(saldo)}</span>.
        </p>
        {ritmo.aviso === 'sin_datos' && (
          <p className="alert alert--info t-small" style={{ marginTop: 'var(--sp-3)' }}>
            Aún no hay movimientos: el ritmo sale solo de tus fijos.
          </p>
        )}
        {ritmo.aviso === 'pocos_datos' && (
          <p className="alert alert--warn t-small" style={{ marginTop: 'var(--sp-3)' }}>
            Solo hay {ritmo.dias === 1 ? '1 día' : `${ritmo.dias} días`} de datos: la previsión será más fiable cuando lleves al menos un mes apuntando.
          </p>
        )}
        <fieldset className="grupo" style={{ marginTop: 'var(--sp-4)' }}>
          <legend className="t-label">Calcular con</legend>
          <div className="segmentos prevision__ventana">
            {VENTANAS.map((v) => (
              <label key={v}>
                <input
                  type="radio"
                  name={`${id}-ventana`}
                  checked={ventana === v}
                  onChange={() => {
                    setVentana(v)
                    guardarVentana(v)
                  }}
                />
                {v === 1 ? 'Último mes' : `${v} meses`}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="card stack" style={{ '--gap': 'var(--sp-3)' } as CSSProperties} aria-labelledby={`${id}-escenario`}>
        <h2 id={`${id}-escenario`} className="card__titulo">
          Escenario
        </h2>
        <fieldset className="segmentos prevision__escenarios">
          <legend className="visually-hidden">Escenario</legend>
          <label>
            <input type="radio" name={`${id}-esc`} checked={elegido === 'actual'} onChange={() => setEscenario('actual')} />
            Ritmo actual
          </label>
          <label>
            <input type="radio" name={`${id}-esc`} checked={elegido === 'recortes'} disabled={recortes === 0} onChange={() => setEscenario('recortes')} aria-describedby={`${id}-recortes`} />
            Con recortes
          </label>
          <label>
            <input type="radio" name={`${id}-esc`} checked={elegido === 'ajustable'} onChange={() => setEscenario('ajustable')} />A mano
          </label>
        </fieldset>
        <p id={`${id}-recortes`} className="t-small muted">
          {recortes > 0 ? (
            <>
              Con los recortes de la última revisión ahorrarías <span className="num">{formatearEuros(recortes)}</span> más al mes.
            </>
          ) : (
            'Los recortes salen de la última revisión semanal o mensual; aún no hay ninguna con sugerencias.'
          )}
        </p>
        {elegido === 'ajustable' && (
          <div className="field">
            <label htmlFor={`${id}-ajuste`} className="field__label">
              Ahorrar más o menos al mes: <span className="num">{ajuste > 0 ? '+' : ''}{formatearEuros(ajuste)}</span>
            </label>
            <input
              id={`${id}-ajuste`}
              type="range"
              className="prevision__ajuste"
              min={-AJUSTE_MAX}
              max={AJUSTE_MAX}
              step={AJUSTE_PASO}
              value={ajuste}
              aria-valuetext={ajuste === 0 ? 'Sin cambio' : `${ajuste > 0 ? 'Más' : 'Menos'} ${formatearEuros(Math.abs(ajuste))} al mes`}
              onChange={(e) => setAjuste(Number(e.target.value))}
            />
          </div>
        )}
        <p>
          Ritmo de este escenario: <span className={`num${r < 0 ? ' text-danger' : ''}`}>{textoRitmo(r)}</span>
        </p>
      </section>

      <section className="card stack" style={{ '--gap': 'var(--sp-3)' } as CSSProperties} aria-labelledby={`${id}-cuanto`}>
        <h2 id={`${id}-cuanto`} className="card__titulo">
          ¿Cuánto tendré en…?
        </h2>
        <fieldset className="segmentos prevision__plazos">
          <legend className="visually-hidden">Plazo</legend>
          {PLAZOS.map((p) => (
            <label key={p}>
              <input type="radio" name={`${id}-plazo`} checked={plazo === String(p)} onChange={() => setPlazo(String(p))} />
              {p === 1 ? '1 mes' : `${p} meses`}
            </label>
          ))}
          <label>
            <input type="radio" name={`${id}-plazo`} checked={plazo === 'fecha'} onChange={() => setPlazo('fecha')} />
            Una fecha
          </label>
        </fieldset>
        {plazo === 'fecha' && (
          <div className="field field--fecha">
            <label htmlFor={`${id}-fecha`} className="field__label">
              Fecha
            </label>
            <input id={`${id}-fecha`} type="date" className="input" min={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
        )}
        <p>
          {fechaPlazo && tendras !== null ? (
            <>
              El {textoFecha(fechaPlazo, hoy)} tendrías <span className={`num${tendras < 0 ? ' text-danger' : ''}`}>{formatearEuros(tendras)}</span>{' '}
              <span className="t-small muted">({tendras - saldo >= 0 ? '+' : '−'}{formatearEuros(Math.abs(tendras - saldo))} desde hoy)</span>
            </>
          ) : (
            <span className="muted">Elige una fecha a partir de mañana.</span>
          )}
        </p>
      </section>

      <section className="card stack" style={{ '--gap': 'var(--sp-3)' } as CSSProperties} aria-labelledby={`${id}-cuando`}>
        <h2 id={`${id}-cuando`} className="card__titulo">
          ¿Cuándo llego a…?
        </h2>
        <div className="alta">
          <div className="field">
            <label htmlFor={`${id}-objetivo`} className="field__label">
              Objetivo
            </label>
            <select id={`${id}-objetivo`} className="input" value={objetivo} onChange={(e) => setObjetivo(e.target.value)}>
              <option value="meta">{meta !== null ? `Mi meta de ahorro (${formatearEuros(meta)})` : 'Mi meta de ahorro (sin poner)'}</option>
              {pendientes.map((d) => (
                <option key={d.id} value={`deseo:${d.id}`}>
                  {d.articulo} ({formatearEuros(d.precio_centimos)})
                </option>
              ))}
              <option value="cantidad">Otra cantidad</option>
            </select>
          </div>
          {objetivo === 'cantidad' && (
            <div className="field field--fecha">
              <label htmlFor={`${id}-cantidad`} className="field__label">
                Cantidad (€)
              </label>
              <input
                id={`${id}-cantidad`}
                className="input"
                inputMode="decimal"
                autoComplete="off"
                placeholder="Ej.: 1.500"
                value={cantidad}
                aria-invalid={errorCantidad ? true : undefined}
                aria-describedby={errorCantidad ? `${id}-cantidad-error` : undefined}
                onChange={(e) => setCantidad(e.target.value)}
              />
              {errorCantidad && (
                <p id={`${id}-cantidad-error`} className="field__error">
                  {errorCantidad}
                </p>
              )}
            </div>
          )}
        </div>
        {objetivo.startsWith('deseo:') && <p className="t-small muted">Cuenta también los deseos que van antes por prioridad, como en la lista de deseos.</p>}
        <p aria-live="polite">
          {llegada ? (
            <span className={llegada.estado === 'no_llega' ? 'text-warn' : undefined}>{textoLlegada(llegada, hoy)}</span>
          ) : objetivo === 'meta' ? (
            <span className="muted">
              <Link to="/dinero">Pon una meta de ahorro</Link> para saber cuándo llegas.
            </span>
          ) : (
            <span className="muted">Escribe una cantidad.</span>
          )}
        </p>
        {llegada?.estado === 'llega' && (
          <p className="t-small muted">
            Fecha: <span className="num">{formatearFecha(llegada.fecha)}</span>
          </p>
        )}
      </section>

      <section className="card" aria-labelledby={`${id}-grafica`}>
        <div className="card__head">
          <h2 id={`${id}-grafica`} className="card__titulo">
            Evolución y previsión
          </h2>
        </div>
        <GraficaPrevision real={serieReal(lista, hoy, 6)} prevision={serieProyeccion(saldo, r, hoy, horizonte)} meta={meta} />
      </section>
    </div>
  )
}
