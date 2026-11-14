// Sección «Fijos cada mes» de Dinero: gastos (o ingresos) que se repiten el
// mismo día cada mes y que la app apunta sola (components/ApuntarFijos).

import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type RefObject } from 'react'
import { CampoCategoria } from '../components/CampoCategoria'
import { prepararFoco } from '../components/foco'
import { IconoBorrar, IconoEditar } from '../components/iconos'
import { CONCEPTO_MAX, centimosATexto, esCategoria, formatearEuros, NOMBRE_CATEGORIA, type TipoMovimiento } from '../lib/dinero'
import { formatearFecha, type FechaDia } from '../lib/fechas'
import { proximoApunte } from '../lib/fijos'
import { borrarFijo, crearFijo, editarFijo, pausarFijo, type DatosFijo, type Fijo } from '../repos/fijos'

type Ejecutar = (accion: () => Promise<unknown>) => Promise<boolean>

const VACIO: DatosFijo = { tipo: 'gasto', concepto: '', importe: '', dia: '', categoria: '' }

export function DineroFijos({ fijos, hoy, ejecutar }: { fijos: Fijo[]; hoy: FechaDia; ejecutar: Ejecutar }) {
  const id = useId()
  const [datos, setDatos] = useState<DatosFijo>(VACIO)

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (await ejecutar(() => crearFijo(datos, hoy))) setDatos(VACIO)
  }

  return (
    <details className="card fijos">
      <summary>
        <span className="t-section">
          Fijos cada mes <span className="num muted">{fijos.length}</span>
        </span>
      </summary>
      <div className="stack" style={{ '--gap': 'var(--sp-4)', marginTop: 'var(--sp-2)' } as CSSProperties}>
        <p className="t-small muted">Lo que pagas (o cobras) cada mes el mismo día: se apunta solo cuando llega el día.</p>

        {fijos.length > 0 && (
          <ul className="list" role="list">
            {fijos.map((f) => (
              <FilaFijo key={f.id} fijo={f} hoy={hoy} ejecutar={ejecutar} />
            ))}
          </ul>
        )}

        <form className="stack" style={{ '--gap': 'var(--sp-3)' } as CSSProperties} onSubmit={(e) => void enviar(e)} aria-labelledby={`${id}-titulo`}>
          <h3 id={`${id}-titulo`} className="t-label">
            Nuevo fijo
          </h3>
          <CamposFijo id={id} datos={datos} cambiar={(c) => setDatos((d) => ({ ...d, ...c }))} />
          <div>
            <button type="submit" className="btn btn--secondary">
              Añadir fijo
            </button>
          </div>
        </form>
      </div>
    </details>
  )
}

function CamposFijo({ id, datos, cambiar, autoFocus }: { id: string; datos: DatosFijo; cambiar: (c: Partial<DatosFijo>) => void; autoFocus?: boolean }) {
  return (
    <>
      <fieldset className="segmentos">
        <legend className="visually-hidden">Tipo</legend>
        {(['gasto', 'ingreso'] as TipoMovimiento[]).map((tipo) => (
          <label key={tipo}>
            <input type="radio" name={`${id}-tipo`} value={tipo} checked={datos.tipo === tipo} onChange={() => cambiar({ tipo })} />
            {tipo === 'gasto' ? 'Gasto' : 'Ingreso'}
          </label>
        ))}
      </fieldset>
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
          <label htmlFor={`${id}-dia`} className="field__label">
            Día del mes
          </label>
          <input
            id={`${id}-dia`}
            className="input"
            inputMode="numeric"
            autoComplete="off"
            maxLength={2}
            value={datos.dia}
            placeholder="1-31"
            aria-describedby={`${id}-dia-ayuda`}
            onChange={(e) => cambiar({ dia: e.target.value })}
          />
        </div>
        {datos.tipo === 'gasto' && <CampoCategoria id={`${id}-categoria`} valor={datos.categoria} cambiar={(categoria) => cambiar({ categoria })} />}
      </div>
      <p id={`${id}-dia-ayuda`} className="field__hint">
        Si el mes tiene menos días (31 en febrero), se apunta el último.
      </p>
    </>
  )
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
    if (await ejecutar(() => editarFijo(f.id, datos))) volver(botonEditar)
  }

  async function borrar() {
    const mover = prepararFoco(fila.current)
    if (await ejecutar(() => borrarFijo(f.id))) mover()
  }

  if (modo === 'editar') {
    return (
      <li className="list__item">
        <form className="edicion stack" style={{ '--gap': 'var(--sp-3)', paddingBlock: 'var(--sp-2)' } as CSSProperties} onSubmit={(e) => void guardar(e)} aria-label={`Editar: ${f.concepto}`}>
          <CamposFijo id={id} datos={datos} cambiar={(c) => setDatos((d) => ({ ...d, ...c }))} autoFocus />
          <p className="t-small muted">Los cambios valen para los meses que aún no se han apuntado.</p>
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
          <span className="break">¿Borrar el fijo «{f.concepto}»? Lo ya apuntado se queda.</span>
          <button type="button" className="btn btn--danger" onClick={() => void borrar()}>
            Borrar
          </button>
          <button type="button" className="btn btn--ghost" autoFocus onClick={() => volver(botonBorrar)}>
            Cancelar
          </button>
        </div>
      </li>
    )
  }

  const esIngreso = f.tipo === 'ingreso'
  const proximo = proximoApunte(f, hoy)
  const categoria = esCategoria(f.categoria) ? NOMBRE_CATEGORIA[f.categoria] : null

  return (
    <li className="list__item movimiento">
      <div className="list__main">
        <p className="break">{f.concepto}</p>
        <p className="t-small muted">
          Día <span className="num">{f.dia}</span>
          {categoria && ` · ${categoria}`}
          {' · '}
          {proximo ? (
            <>
              próximo <span className="num">{formatearFecha(proximo)}</span>
            </>
          ) : (
            <span className="text-warn">En pausa</span>
          )}
        </p>
      </div>
      <span className={`num importe${esIngreso ? ' importe--ingreso' : ''}`}>
        {esIngreso ? '+' : '−'}
        {formatearEuros(f.importe_centimos)}
      </span>
      <div className="acciones">
        <button type="button" className="btn btn--ghost" aria-label={`${f.activo ? 'Pausar' : 'Reanudar'}: ${f.concepto}`} onClick={() => void ejecutar(() => pausarFijo(f.id, f.activo, hoy))}>
          {f.activo ? 'Pausar' : 'Reanudar'}
        </button>
        <button
          type="button"
          ref={botonEditar}
          className="icon-btn"
          aria-label={`Editar: ${f.concepto}`}
          onClick={() => {
            setDatos({ tipo: f.tipo, concepto: f.concepto, importe: centimosATexto(f.importe_centimos), dia: String(f.dia), categoria: f.categoria ?? '' })
            setModo('editar')
          }}
        >
          <IconoEditar />
        </button>
        <button type="button" ref={botonBorrar} className="icon-btn icon-btn--peligro" aria-label={`Borrar: ${f.concepto}`} onClick={() => setModo('borrar')}>
          <IconoBorrar />
        </button>
      </div>
    </li>
  )
}
