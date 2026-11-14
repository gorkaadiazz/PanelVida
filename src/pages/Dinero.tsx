import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type RefObject } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AvisoError } from '../components/AvisoError'
import { CampoCategoria } from '../components/CampoCategoria'
import { CampoNecesidad } from '../components/CampoNecesidad'
import { GastosPorCategoria } from '../components/GastosPorCategoria'
import { GraficaAhorro } from '../components/GraficaAhorro'
import { Pagina } from '../components/Pagina'
import { Vacio } from '../components/Vacio'
import { prepararFoco } from '../components/foco'
import { IconoBorrar, IconoDinero, IconoEditar, IconoFlecha } from '../components/iconos'
import { useAccion } from '../components/useAccion'
import { useHoy } from '../components/useHoy'
import {
  CONCEPTO_MAX,
  centimosATexto,
  esCategoria,
  esNecesidad,
  formatearEuros,
  gastosPorCategoria,
  NOMBRE_CATEGORIA,
  NOMBRE_NECESIDAD,
  mesDe,
  movimientosDelMes,
  nombreMes,
  progresoMeta,
  resumenMes,
  resumir,
  sumarMeses,
  ultimosMeses,
  type Mes,
  type TipoMovimiento,
} from '../lib/dinero'
import { formatearFecha, type FechaDia } from '../lib/fechas'
import { idsDeFijos } from '../lib/fijos'
import { useFijos, useMovimientos, usePerfil, useRevisiones } from '../repos/hooks'
import { borrarMovimiento, crearMovimiento, editarMovimiento, type DatosMovimiento, type Movimiento } from '../repos/movimientos'
import { guardarMetaAhorro, type Perfil } from '../repos/perfil'
import { useEstadoSync } from '../sync/hooks'
import { DineroFijos } from './DineroFijos'
import { DineroRevisiones } from './DineroRevisiones'

type Ejecutar = (accion: () => Promise<unknown>) => Promise<boolean>

/** Secciones de Dinero (?ver=…). Sin parámetro, los movimientos. */
const SECCIONES = [
  { id: 'movimientos', nombre: 'Movimientos' },
  { id: 'fijos', nombre: 'Fijos' },
  { id: 'revisiones', nombre: 'Revisiones' },
] as const
type Seccion = (typeof SECCIONES)[number]['id']

export function Dinero() {
  const [params] = useSearchParams()
  const ver = params.get('ver')
  const seccion: Seccion = SECCIONES.some((s) => s.id === ver) ? (ver as Seccion) : 'movimientos'
  const nombre = SECCIONES.find((s) => s.id === seccion)?.nombre ?? 'Movimientos'
  const { error, ejecutar, limpiar } = useAccion()

  return (
    <Pagina titulo={seccion === 'movimientos' ? 'Dinero' : `${nombre} · Dinero`} encabezado="Dinero">
      <div className="stack">
        <nav className="pestanas" aria-label="Secciones de Dinero">
          {SECCIONES.map((s) => (
            <Link key={s.id} to={s.id === 'movimientos' ? '/dinero' : `/dinero?ver=${s.id}`} className="pestanas__item" aria-current={s.id === seccion ? 'page' : undefined}>
              {s.nombre}
            </Link>
          ))}
        </nav>
        <AvisoError mensaje={error} onCerrar={limpiar} />
        {seccion === 'movimientos' && <DineroMovimientos ejecutar={ejecutar} />}
        {seccion === 'fijos' && <SeccionFijos ejecutar={ejecutar} />}
        {seccion === 'revisiones' && <SeccionRevisiones ejecutar={ejecutar} />}
      </div>
    </Pagina>
  )
}

function SeccionFijos({ ejecutar }: { ejecutar: Ejecutar }) {
  const dia = useHoy()
  const fijos = useFijos()
  const { primeraDescargaHecha } = useEstadoSync()
  const cargando = fijos.cargando || ((fijos.datos ?? []).length === 0 && !primeraDescargaHecha)
  return <DineroFijos fijos={fijos.datos ?? []} hoy={dia} ejecutar={ejecutar} cargando={cargando} error={!!fijos.error} />
}

function SeccionRevisiones({ ejecutar }: { ejecutar: Ejecutar }) {
  const revisiones = useRevisiones()
  const { primeraDescargaHecha } = useEstadoSync()
  const cargando = revisiones.cargando || ((revisiones.datos ?? []).length === 0 && !primeraDescargaHecha)
  return <DineroRevisiones revisiones={revisiones.datos ?? []} ejecutar={ejecutar} cargando={cargando} error={!!revisiones.error} />
}

function DineroMovimientos({ ejecutar }: { ejecutar: Ejecutar }) {
  const dia = useHoy()
  const mesActual = mesDe(dia)
  const movimientos = useMovimientos()
  const perfil = usePerfil()
  const fijos = useFijos()
  const { primeraDescargaHecha } = useEstadoSync()
  const [mes, setMes] = useState<Mes>(mesActual)

  const lista = movimientos.datos ?? []
  const cargando = movimientos.cargando || (lista.length === 0 && !primeraDescargaHecha)
  // Mientras llega la primera copia, las tarjetas no enseñan un «0,00 €» que no es real
  const sinDatos = cargando && lista.length === 0 && !movimientos.error
  const delMes = movimientosDelMes(lista, mes)
  const resumen = resumenMes(lista, mes)
  const total = resumir(lista).ahorro
  // Movimientos de este mes que apuntó un fijo (llevan la etiqueta «Fijo»)
  const deFijos = idsDeFijos(delMes, fijos.datos ?? [])

  return (
    <>
      {movimientos.error && <AvisoError mensaje="No se han podido leer tus movimientos de este dispositivo. Recarga la página." />}

      <div className="mes-nav">
        <button type="button" className="icon-btn" aria-label="Mes anterior" onClick={() => setMes((m) => sumarMeses(m, -1))}>
          <IconoFlecha style={{ transform: 'rotate(180deg)' }} />
        </button>
        <p className="mes-nav__nombre" aria-live="polite">
          {nombreMes(mes).replace(/^./, (c) => c.toLocaleUpperCase('es-ES'))}
        </p>
        {/* aria-disabled y no disabled: al llegar al mes actual el botón
            conserva el foco en vez de soltarlo al <body> */}
        <button
          type="button"
          className="icon-btn"
          aria-label="Mes siguiente"
          aria-disabled={mes >= mesActual}
          onClick={() => {
            if (mes < mesActual) setMes((m) => sumarMeses(m, 1))
          }}
        >
          <IconoFlecha />
        </button>
      </div>

      <div className="grid-cards">
        <section className="card" aria-labelledby="dinero-mes">
          <div className="card__head">
            <h2 id="dinero-mes" className="card__titulo">
              Ahorro del mes
            </h2>
          </div>
          {sinDatos ? (
            <EsqueletoCifra />
          ) : (
            <>
              <p className={`num num--xl${resumen.ahorro < 0 ? ' text-danger' : ''}`}>{formatearEuros(resumen.ahorro)}</p>
              <dl className="cifras" style={{ marginTop: 'var(--sp-3)' }}>
                <dt>Ingresos</dt>
                <dd className="num">{formatearEuros(resumen.ingresos)}</dd>
                <dt>Gastos</dt>
                <dd className="num">{formatearEuros(resumen.gastos)}</dd>
              </dl>
            </>
          )}
        </section>

        <TarjetaMeta total={total} perfil={perfil.datos ?? null} ejecutar={ejecutar} cargando={sinDatos} />

        <section className="card" aria-labelledby="dinero-grafica">
          <div className="card__head">
            <h2 id="dinero-grafica" className="card__titulo">
              Ahorro de los últimos 6 meses
            </h2>
          </div>
          {sinDatos ? <EsqueletoCifra alto="8rem" /> : <GraficaAhorro meses={ultimosMeses(lista, mesActual)} />}
        </section>

        <section className="card" aria-labelledby="dinero-categorias">
          <div className="card__head">
            <h2 id="dinero-categorias" className="card__titulo">
              {/* El mes ya está en la navegación de arriba: sin «· noviembre» en el título */}
              {mes === mesActual ? 'En qué gastas este mes' : `En qué gastaste en ${nombreMes(mes).replace(/ de \d+$/, '')}`}
            </h2>
          </div>
          {sinDatos ? <EsqueletoCifra alto="6rem" /> : <GastosPorCategoria gastos={gastosPorCategoria(lista, mes)} />}
        </section>
      </div>

      <AltaMovimiento hoy={dia} ejecutar={ejecutar} onCreado={(fecha) => setMes(mesDe(fecha))} />

      <section aria-labelledby="dinero-lista">
        <h2 id="dinero-lista" className="t-section" tabIndex={-1}>
          Movimientos de {nombreMes(mes).replace(/ de \d+$/, '')} <span className="num muted">{delMes.length}</span>
        </h2>
        {movimientos.error && lista.length === 0 ? null : sinDatos ? (
          <div className="stack" role="status" aria-busy="true" style={{ '--gap': 'var(--sp-2)' } as CSSProperties}>
            <span className="visually-hidden">Cargando tus movimientos…</span>
            <span className="skeleton" style={{ '--h': '3rem' } as CSSProperties} />
            <span className="skeleton" style={{ '--h': '3rem' } as CSSProperties} />
          </div>
        ) : delMes.length === 0 ? (
          <Vacio icono={<IconoDinero />} titulo={lista.length === 0 ? 'Aún no has apuntado nada' : 'Nada apuntado este mes'}>
            Apunta arriba tus ingresos y gastos para ver cuánto ahorras.
          </Vacio>
        ) : (
          <ul className="list" role="list">
            {delMes.map((m) => (
              <FilaMovimiento key={m.id} movimiento={m} deFijo={deFijos.has(m.id)} ejecutar={ejecutar} onCambioDeMes={(fecha) => setMes(mesDe(fecha))} />
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

/** Hueco de carga con la forma de la cifra destacada (solo visual: el aviso
 *  «Cargando…» lo da la lista de movimientos). */
function EsqueletoCifra({ alto = '2rem' }: { alto?: string }) {
  return <span className="skeleton" aria-hidden="true" style={{ '--h': alto, '--w': alto === '2rem' ? '9rem' : '100%' } as CSSProperties} />
}

function TarjetaMeta({ total, perfil, ejecutar, cargando }: { total: number; perfil: Perfil | null; ejecutar: Ejecutar; cargando: boolean }) {
  const meta = perfil?.meta_ahorro_centimos ?? null
  const progreso = progresoMeta(total, meta)
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState('')
  const id = useId()
  const boton = useRef<HTMLButtonElement>(null)
  const volver = useRef(false)
  useEffect(() => {
    if (editando || !volver.current) return
    volver.current = false
    boton.current?.focus()
  }, [editando])

  function terminar() {
    volver.current = true
    setEditando(false)
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    if (await ejecutar(() => guardarMetaAhorro(texto))) terminar()
  }

  return (
    <section className="card" aria-labelledby="dinero-total">
      <div className="card__head">
        <h2 id="dinero-total" className="card__titulo">
          Ahorro total
        </h2>
      </div>
      {cargando ? <EsqueletoCifra /> : <p className={`num num--xl${total < 0 ? ' text-danger' : ''}`}>{formatearEuros(total)}</p>}

      {editando ? (
        <form className="stack" style={{ '--gap': 'var(--sp-2)', marginTop: 'var(--sp-3)' } as CSSProperties} onSubmit={(e) => void guardar(e)}>
          <div className="field">
            <label htmlFor={id} className="field__label">
              Meta de ahorro (€)
            </label>
            <input
              id={id}
              className="input"
              inputMode="decimal"
              autoComplete="off"
              value={texto}
              placeholder="Ej.: 1.000"
              onChange={(e) => setTexto(e.target.value)}
              aria-describedby={`${id}-ayuda`}
              autoFocus
            />
            <p id={`${id}-ayuda`} className="field__hint">
              Déjalo vacío para quitar la meta.
            </p>
          </div>
          <div className="row">
            <button type="submit" className="btn btn--primary">
              Guardar
            </button>
            <button type="button" className="btn btn--ghost" onClick={terminar}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <>
          {!cargando && progreso && meta !== null && (
            <div className="stack" style={{ '--gap': 'var(--sp-2)', marginTop: 'var(--sp-3)' } as CSSProperties}>
              <div
                className={`progress progress--lg${progreso.conseguida ? ' progress--ok' : ''}`}
                role="progressbar"
                aria-label="Progreso hacia la meta de ahorro"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progreso.porcentaje}
                style={{ '--p': `${progreso.porcentaje}%` } as CSSProperties}
              />
              <p className="t-small muted">
                {progreso.conseguida ? (
                  <>
                    <span className="text-ok">Meta conseguida</span> · <span className="num">{formatearEuros(meta)}</span>
                  </>
                ) : (
                  <>
                    <span className="num">{progreso.porcentaje} %</span> de <span className="num">{formatearEuros(meta)}</span> · faltan{' '}
                    <span className="num">{formatearEuros(progreso.faltan)}</span>
                  </>
                )}
              </p>
            </div>
          )}
          <div className="card__foot">
            <button
              type="button"
              ref={boton}
              className="btn btn--ghost"
              disabled={!perfil}
              aria-describedby={perfil ? undefined : 'dinero-meta-espera'}
              onClick={() => {
                setTexto(meta ? centimosATexto(meta) : '')
                setEditando(true)
              }}
            >
              {meta ? 'Cambiar la meta' : 'Poner una meta'}
            </button>
          </div>
          {!perfil && (
            <p id="dinero-meta-espera" className="t-small muted">
              Disponible cuando se sincronice tu cuenta.
            </p>
          )}
        </>
      )}
    </section>
  )
}

function CamposMovimiento({
  id,
  datos,
  cambiar,
  autoFocus,
}: {
  id: string
  datos: DatosMovimiento
  cambiar: (cambios: Partial<DatosMovimiento>) => void
  autoFocus?: boolean
}) {
  return (
    <>
      <fieldset className="segmentos">
        <legend className="visually-hidden">Tipo</legend>
        {(['gasto', 'ingreso'] as TipoMovimiento[]).map((tipo) => (
          <label key={tipo}>
            <input
              type="radio"
              name={`${id}-tipo`}
              value={tipo}
              checked={datos.tipo === tipo}
              onChange={() => cambiar({ tipo })}
            />
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
            placeholder="Ej.: Cine"
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
          <label htmlFor={`${id}-fecha`} className="field__label">
            Fecha
          </label>
          <input id={`${id}-fecha`} type="date" className="input" value={datos.fecha} onChange={(e) => cambiar({ fecha: e.target.value })} />
        </div>
        {datos.tipo === 'gasto' && <CampoCategoria id={`${id}-categoria`} valor={datos.categoria ?? ''} cambiar={(categoria) => cambiar({ categoria })} />}
        {datos.tipo === 'gasto' && <CampoNecesidad id={`${id}-necesidad`} valor={datos.necesidad ?? ''} cambiar={(necesidad) => cambiar({ necesidad })} />}
      </div>
    </>
  )
}

function AltaMovimiento({ hoy, ejecutar, onCreado }: { hoy: FechaDia; ejecutar: Ejecutar; onCreado: (fecha: FechaDia) => void }) {
  const vacio = (): DatosMovimiento => ({ tipo: 'gasto', concepto: '', importe: '', fecha: hoy, categoria: '', necesidad: '' })
  const [datos, setDatos] = useState<DatosMovimiento>(vacio)
  const id = useId()

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (await ejecutar(() => crearMovimiento(datos))) {
      onCreado(datos.fecha)
      // Se mantiene el tipo y la fecha: lo normal es apuntar varios seguidos
      setDatos((d) => ({ ...d, concepto: '', importe: '', categoria: '', necesidad: '' }))
    }
  }

  return (
    <form className="card stack" style={{ '--gap': 'var(--sp-3)' } as CSSProperties} onSubmit={(e) => void enviar(e)} aria-labelledby={`${id}-titulo`}>
      <h2 id={`${id}-titulo`} className="t-section">
        Apuntar
      </h2>
      <CamposMovimiento id={id} datos={datos} cambiar={(c) => setDatos((d) => ({ ...d, ...c }))} />
      <div>
        <button type="submit" className="btn btn--primary">
          Añadir {datos.tipo === 'ingreso' ? 'ingreso' : 'gasto'}
        </button>
      </div>
    </form>
  )
}

function datosDe(m: Movimiento, importe: string): DatosMovimiento {
  return {
    tipo: m.tipo,
    concepto: m.concepto,
    importe,
    fecha: m.fecha,
    categoria: esCategoria(m.categoria) ? m.categoria : '',
    necesidad: esNecesidad(m.necesidad) ? m.necesidad : '',
  }
}

function FilaMovimiento({
  movimiento: m,
  deFijo,
  ejecutar,
  onCambioDeMes,
}: {
  movimiento: Movimiento
  /** Lo apuntó solo un fijo. */
  deFijo: boolean
  ejecutar: Ejecutar
  /** Si se edita y pasa a otro mes, la pantalla se va a ese mes (si no, desaparecería sin más). */
  onCambioDeMes: (fecha: FechaDia) => void
}) {
  const [modo, setModo] = useState<'ver' | 'editar' | 'borrar'>('ver')
  const [datos, setDatos] = useState<DatosMovimiento>(() => datosDe(m, ''))
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
    if (!(await ejecutar(() => editarMovimiento(m.id, datos)))) return
    if (mesDe(datos.fecha) !== mesDe(m.fecha)) {
      // La fila se va a otra lista: se enseña ese mes y el foco va a su título
      onCambioDeMes(datos.fecha)
      requestAnimationFrame(() => document.getElementById('dinero-lista')?.focus())
    } else volver(botonEditar)
  }

  async function borrar() {
    const mover = prepararFoco(fila.current)
    if (await ejecutar(() => borrarMovimiento(m.id))) mover()
  }

  const esIngreso = m.tipo === 'ingreso'

  if (modo === 'editar') {
    return (
      <li className="list__item">
        <form className="edicion stack" style={{ '--gap': 'var(--sp-3)', paddingBlock: 'var(--sp-2)' } as CSSProperties} onSubmit={(e) => void guardar(e)} aria-label={`Editar: ${m.concepto}`}>
          <CamposMovimiento id={id} datos={datos} cambiar={(c) => setDatos((d) => ({ ...d, ...c }))} autoFocus />
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
          <span className="break">¿Borrar «{m.concepto}»?</span>
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

  return (
    <li className="list__item movimiento" ref={fila}>
      <div className="list__main">
        <p className="break">{m.concepto}</p>
        <p className="t-small muted">
          <span className="num">{formatearFecha(m.fecha)}</span> · {esIngreso ? 'Ingreso' : esCategoria(m.categoria) ? NOMBRE_CATEGORIA[m.categoria] : 'Gasto'}
          {!esIngreso && esNecesidad(m.necesidad) && ` · ${NOMBRE_NECESIDAD[m.necesidad]}`}
          {deFijo && ' · Fijo'}
        </p>
      </div>
      <span className={`num importe${esIngreso ? ' importe--ingreso' : ''}`}>
        {esIngreso ? '+' : '−'}
        {formatearEuros(m.importe_centimos)}
      </span>
      <div className="acciones">
        <button
          type="button"
          ref={botonEditar}
          className="icon-btn"
          aria-label={`Editar: ${m.concepto}`}
          onClick={() => {
            setDatos(datosDe(m, centimosATexto(m.importe_centimos)))
            setModo('editar')
          }}
        >
          <IconoEditar />
        </button>
        <button type="button" ref={botonBorrar} className="icon-btn icon-btn--peligro" aria-label={`Borrar: ${m.concepto}`} onClick={() => setModo('borrar')}>
          <IconoBorrar />
        </button>
      </div>
    </li>
  )
}
