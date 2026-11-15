// Sección «Fijos» de Dinero: gastos (o ingresos) que se repiten cada día,
// semana, mes o año y que la app apunta sola (components/ApuntarFijos). Cada
// uno dice lo que cuesta al día, a la semana, al mes y al año.

import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type RefObject } from 'react'
import { AvisoError } from '../components/AvisoError'
import { CampoCategoria } from '../components/CampoCategoria'
import { CampoMedio } from '../components/CampoMedio'
import { CampoNecesidad } from '../components/CampoNecesidad'
import { prepararFoco } from '../components/foco'
import { IconoBorrar, IconoDinero, IconoEditar } from '../components/iconos'
import { Vacio } from '../components/Vacio'
import { CONCEPTO_MAX, centimosATexto, esCategoria, esNecesidad, formatearEuros, medioDe, NOMBRE_CATEGORIA, NOMBRE_MEDIO, NOMBRE_NECESIDAD, type TipoMovimiento } from '../lib/dinero'
import { formatearFecha, type FechaDia } from '../lib/fechas'
import {
  alMes,
  DIAS_SEMANA,
  equivalencias,
  esFrecuencia,
  FRECUENCIAS,
  NOMBRE_FRECUENCIA,
  normalizarFijo,
  proximoApunte,
  textoCuando,
  totalFijoMensual,
  UNIDAD_FRECUENCIA,
  type Frecuencia,
} from '../lib/fijos'
import { borrarFijo, crearFijo, editarFijo, pausarFijo, type DatosFijo, type Fijo } from '../repos/fijos'

type Ejecutar = (accion: () => Promise<unknown>) => Promise<boolean>

const VACIO: DatosFijo = { tipo: 'gasto', concepto: '', importe: '', frecuencia: 'mensual', dia: '', mes: '', categoria: '', necesidad: '', medio: 'tarjeta' }

const NOMBRES_MES = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat('es-ES', { month: 'long', timeZone: 'UTC' }).format(Date.UTC(2000, i, 1)).replace(/^./, (c) => c.toLocaleUpperCase('es-ES')),
)

/** Los que más cuestan al mes primero; los ingresos al final. */
function ordenar(fijos: readonly Fijo[]): Fijo[] {
  return [...fijos].sort(
    (a, b) =>
      (a.tipo === 'ingreso' ? 1 : 0) - (b.tipo === 'ingreso' ? 1 : 0) ||
      alMes(b.importe_centimos, b.frecuencia) - alMes(a.importe_centimos, a.frecuencia) ||
      a.concepto.localeCompare(b.concepto, 'es'),
  )
}

export function DineroFijos({ fijos, hoy, ejecutar, cargando, error }: { fijos: Fijo[]; hoy: FechaDia; ejecutar: Ejecutar; cargando: boolean; error: boolean }) {
  const id = useId()
  const [datos, setDatos] = useState<DatosFijo>(VACIO)
  const gastoMes = totalFijoMensual(fijos, 'gasto')
  const ingresoMes = totalFijoMensual(fijos, 'ingreso')
  const lista = ordenar(fijos)

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (await ejecutar(() => crearFijo(datos, hoy))) setDatos(VACIO)
  }

  return (
    <div className="stack">
      {error && <AvisoError mensaje="No se han podido leer tus fijos de este dispositivo. Recarga la página." />}
      <section className="card" aria-labelledby={`${id}-total`}>
        <div className="card__head">
          <h2 id={`${id}-total`} className="card__titulo">
            Gastos fijos al mes
          </h2>
        </div>
        {cargando && fijos.length === 0 ? (
          <span className="skeleton" aria-hidden="true" style={{ '--h': '2rem', '--w': '9rem' } as CSSProperties} />
        ) : (
          <>
            <p className="num num--xl">{formatearEuros(gastoMes)}</p>
            <p className="t-small muted" style={{ marginTop: 'var(--sp-2)' }}>
              Al año <span className="num">{formatearEuros(gastoMes * 12)}</span>
              {ingresoMes > 0 && (
                <>
                  {' · '}ingresos fijos <span className="num">{formatearEuros(ingresoMes)}</span>/mes
                </>
              )}
              . Solo cuentan los activos.
            </p>
          </>
        )}
      </section>

      <form className="card stack" style={{ '--gap': 'var(--sp-3)' } as CSSProperties} onSubmit={(e) => void enviar(e)} aria-labelledby={`${id}-titulo`}>
        <h2 id={`${id}-titulo`} className="t-section">
          Nuevo fijo
        </h2>
        <CamposFijo id={id} datos={datos} cambiar={(c) => setDatos((d) => ({ ...d, ...c }))} />
        <div>
          <button type="submit" className="btn btn--primary">
            Añadir fijo
          </button>
        </div>
      </form>

      <section aria-labelledby={`${id}-lista`}>
        <h2 id={`${id}-lista`} className="t-section">
          Tus fijos <span className="num muted">{fijos.length}</span>
        </h2>
        {error ? null : cargando && fijos.length === 0 ? (
          <div className="stack" role="status" aria-busy="true" style={{ '--gap': 'var(--sp-2)' } as CSSProperties}>
            <span className="visually-hidden">Cargando tus fijos…</span>
            <span className="skeleton" style={{ '--h': '3rem' } as CSSProperties} />
          </div>
        ) : lista.length === 0 ? (
          <Vacio icono={<IconoDinero />} titulo="Aún no tienes fijos">
            Suscripciones, móvil, gimnasio, transporte… Se apuntan solos en Movimientos cuando les toca.
          </Vacio>
        ) : (
          <ul className="list" role="list">
            {lista.map((f) => (
              <FilaFijo key={f.id} fijo={f} hoy={hoy} ejecutar={ejecutar} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function CamposFijo({ id, datos, cambiar, autoFocus }: { id: string; datos: DatosFijo; cambiar: (c: Partial<DatosFijo>) => void; autoFocus?: boolean }) {
  const frecuencia: Frecuencia = esFrecuencia(datos.frecuencia) ? datos.frecuencia : 'mensual'
  return (
    <>
      <div className="row">
        <fieldset className="segmentos">
          <legend className="visually-hidden">Tipo</legend>
          {(['gasto', 'ingreso'] as TipoMovimiento[]).map((tipo) => (
            <label key={tipo}>
              <input type="radio" name={`${id}-tipo`} value={tipo} checked={datos.tipo === tipo} onChange={() => cambiar({ tipo })} />
              {tipo === 'gasto' ? 'Gasto' : 'Ingreso'}
            </label>
          ))}
        </fieldset>
        <CampoMedio id={id} valor={datos.medio ?? ''} cambiar={(medio) => cambiar({ medio })} />
      </div>
      <div className="alta alta--tres">
        <div className="field">
          <label htmlFor={`${id}-concepto`} className="field__label">
            Concepto
          </label>
          <input
            id={`${id}-concepto`}
            className="input"
            value={datos.concepto}
            maxLength={CONCEPTO_MAX}
            placeholder="Ej.: Gimnasio"
            onChange={(e) => cambiar({ concepto: e.target.value })}
            autoFocus={autoFocus}
          />
        </div>
        <div className="field field--fecha">
          <label htmlFor={`${id}-importe`} className="field__label">
            Importe (€)
          </label>
          <input
            id={`${id}-importe`}
            className="input"
            inputMode="decimal"
            autoComplete="off"
            value={datos.importe}
            placeholder="0,00"
            onChange={(e) => cambiar({ importe: e.target.value })}
          />
        </div>
        <div className="field field--fecha">
          <label htmlFor={`${id}-frecuencia`} className="field__label">
            Se repite
          </label>
          <select
            id={`${id}-frecuencia`}
            className="input"
            value={frecuencia}
            aria-describedby={frecuencia === 'diaria' ? `${id}-diaria-ayuda` : undefined}
            onChange={(e) => cambiar({ frecuencia: e.target.value, dia: e.target.value === 'semanal' ? '1' : '', mes: '' })}
          >
            {FRECUENCIAS.map((f) => (
              <option key={f} value={f}>
                {NOMBRE_FRECUENCIA[f]}
              </option>
            ))}
          </select>
        </div>
        {frecuencia === 'semanal' && (
          <div className="field field--fecha">
            <label htmlFor={`${id}-dia`} className="field__label">
              Día
            </label>
            <select id={`${id}-dia`} className="input" value={datos.dia || '1'} onChange={(e) => cambiar({ dia: e.target.value })}>
              {DIAS_SEMANA.map((d, i) => (
                <option key={d} value={String(i + 1)}>
                  {d.replace(/^./, (c) => c.toLocaleUpperCase('es-ES'))}
                </option>
              ))}
            </select>
          </div>
        )}
        {frecuencia === 'anual' && (
          <div className="field field--fecha">
            <label htmlFor={`${id}-mes`} className="field__label">
              Mes
            </label>
            <select id={`${id}-mes`} className="input" value={datos.mes} onChange={(e) => cambiar({ mes: e.target.value })}>
              <option value="">Elige…</option>
              {NOMBRES_MES.map((m, i) => (
                <option key={m} value={String(i + 1)}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        )}
        {(frecuencia === 'mensual' || frecuencia === 'anual') && (
          <div className="field field--fecha">
            <label htmlFor={`${id}-dia`} className="field__label">
              {frecuencia === 'mensual' ? 'Día del mes' : 'Día'}
            </label>
            <input
              id={`${id}-dia`}
              className="input"
              inputMode="numeric"
              autoComplete="off"
              maxLength={2}
              value={datos.dia}
              placeholder="1-31"
              aria-describedby={frecuencia === 'mensual' ? `${id}-dia-ayuda` : undefined}
              onChange={(e) => cambiar({ dia: e.target.value })}
            />
          </div>
        )}
        {datos.tipo === 'gasto' && <CampoCategoria id={`${id}-categoria`} valor={datos.categoria} cambiar={(categoria) => cambiar({ categoria })} />}
        {datos.tipo === 'gasto' && <CampoNecesidad id={`${id}-necesidad`} valor={datos.necesidad} cambiar={(necesidad) => cambiar({ necesidad })} />}
      </div>
      {frecuencia === 'mensual' && (
        <p id={`${id}-dia-ayuda`} className="field__hint">
          Si el mes tiene menos días (31 en febrero), se apunta el último.
        </p>
      )}
      {frecuencia === 'diaria' && <p id={`${id}-diaria-ayuda`} className="field__hint">Para no llenar la lista, se apunta una vez por semana (el domingo) con lo de los 7 días.</p>}
    </>
  )
}

function datosDe(f: Fijo): DatosFijo {
  const n = normalizarFijo(f)
  return {
    tipo: f.tipo,
    concepto: f.concepto,
    importe: centimosATexto(f.importe_centimos),
    frecuencia: n.frecuencia,
    dia: n.frecuencia === 'diaria' ? '' : String(f.dia),
    mes: n.mes ? String(n.mes) : '',
    categoria: esCategoria(f.categoria) ? f.categoria : '',
    necesidad: esNecesidad(f.necesidad) ? f.necesidad : '',
    medio: medioDe(f),
  }
}

function FilaFijo({ fijo: f, hoy, ejecutar }: { fijo: Fijo; hoy: FechaDia; ejecutar: Ejecutar }) {
  const [modo, setModo] = useState<'ver' | 'editar' | 'borrar'>('ver')
  const [datos, setDatos] = useState<DatosFijo>(VACIO)
  const id = useId()
  const fila = useRef<HTMLLIElement>(null)
  const botonEditar = useRef<HTMLButtonElement>(null)
  const botonBorrar = useRef<HTMLButtonElement>(null)
  const volverA = useRef<RefObject<HTMLButtonElement | null> | null>(null)
  useEffect(() => {
    if (modo !== 'ver' || !volverA.current) return
    volverA.current.current?.focus()
    volverA.current = null
  }, [modo])

  function volver(boton: RefObject<HTMLButtonElement | null>) {
    volverA.current = boton
    setModo('ver')
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    if (await ejecutar(() => editarFijo(f.id, datos, hoy))) volver(botonEditar)
  }

  async function borrar() {
    const mover = prepararFoco(fila.current)
    if (await ejecutar(() => borrarFijo(f.id, hoy))) mover()
  }

  if (modo === 'editar') {
    return (
      <li className="list__item">
        <form className="edicion stack" style={{ '--gap': 'var(--sp-3)', paddingBlock: 'var(--sp-2)' } as CSSProperties} onSubmit={(e) => void guardar(e)} aria-label={`Editar: ${f.concepto}`}>
          <CamposFijo id={id} datos={datos} cambiar={(c) => setDatos((d) => ({ ...d, ...c }))} autoFocus />
          <p className="t-small muted">Los cambios valen para lo que aún no se ha apuntado.</p>
          <div className="row">
            <button type="submit" className="btn btn--primary">
              Guardar
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => volver(botonEditar)}>
              Cancelar
            </button>
          </div>
        </form>
      </li>
    )
  }

  if (modo === 'borrar') {
    return (
      <li className="list__item" ref={fila}>
        <div className="confirmar list__main">
          <span className="break">¿Dar de baja «{f.concepto}»? Lo ya apuntado se queda.</span>
          <button type="button" className="btn btn--danger" onClick={() => void borrar()}>
            Dar de baja
          </button>
          <button type="button" className="btn btn--ghost" autoFocus onClick={() => volver(botonBorrar)}>
            Cancelar
          </button>
        </div>
      </li>
    )
  }

  const esIngreso = f.tipo === 'ingreso'
  const { frecuencia } = normalizarFijo(f)
  const proximo = proximoApunte(f, hoy)
  const categoria = esCategoria(f.categoria) ? NOMBRE_CATEGORIA[f.categoria] : null
  const necesidad = !esIngreso && esNecesidad(f.necesidad) ? NOMBRE_NECESIDAD[f.necesidad] : null
  const eq = equivalencias(f.importe_centimos, frecuencia)
  // "1,50 €/día ≈ 45,63 €/mes ≈ 547,50 €/año": de la frecuencia del fijo hacia arriba
  const cuesta = [
    frecuencia === 'diaria' && `${formatearEuros(eq.dia)}/día`,
    (frecuencia === 'diaria' || frecuencia === 'semanal') && `${formatearEuros(eq.semana)}/semana`,
    `${formatearEuros(eq.mes)}/mes`,
    `${formatearEuros(eq.anio)}/año`,
  ].filter(Boolean)

  return (
    <li className={`list__item movimiento fijo${f.activo ? '' : ' fijo--pausa'}`}>
      <div className="list__main">
        <p className="break">{f.concepto}</p>
        <p className="t-small muted">
          {textoCuando(f)}
          {categoria && ` · ${categoria}`}
          {necesidad && ` · ${necesidad}`}
          {` · ${NOMBRE_MEDIO[medioDe(f)]}`}
          {' · '}
          {proximo ? (
            <>
              próximo <span className="num">{formatearFecha(proximo)}</span>
            </>
          ) : (
            <span className="text-warn">En pausa</span>
          )}
        </p>
        <p className="t-small muted fijo__cuesta">
          {esIngreso ? 'Supone' : 'Cuesta'} <span className="num">{cuesta.join(' ≈ ')}</span>
        </p>
      </div>
      <span className={`num importe${esIngreso ? ' importe--ingreso' : ''}`}>
        {esIngreso ? '+' : '−'}
        {formatearEuros(f.importe_centimos)}
        <span className="muted importe__unidad">/{UNIDAD_FRECUENCIA[frecuencia]}</span>
      </span>
      <div className="acciones">
        <button type="button" className="btn btn--ghost fijo__pausa" aria-label={`${f.activo ? 'Pausar' : 'Reanudar'}: ${f.concepto}`} onClick={() => void ejecutar(() => pausarFijo(f.id, f.activo, hoy))}>
          {f.activo ? 'Pausar' : 'Reanudar'}
        </button>
        <button
          type="button"
          ref={botonEditar}
          className="icon-btn"
          aria-label={`Editar: ${f.concepto}`}
          onClick={() => {
            setDatos(datosDe(f))
            setModo('editar')
          }}
        >
          <IconoEditar />
        </button>
        <button type="button" ref={botonBorrar} className="icon-btn icon-btn--peligro" aria-label={`Dar de baja: ${f.concepto}`} onClick={() => setModo('borrar')}>
          <IconoBorrar />
        </button>
      </div>
    </li>
  )
}
