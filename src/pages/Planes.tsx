// Planes pendientes: idea → planeado (con fecha) → hecho (con valoración).
// Filtros por estado y por tipo. Una idea de la bandeja llega como ?idea=<id>.

import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type RefObject } from 'react'
import { AvisoError } from '../components/AvisoError'
import { AvisoDesdeIdea } from '../components/DesdeIdea'
import { Pagina } from '../components/Pagina'
import { Vacio } from '../components/Vacio'
import { prepararFoco } from '../components/foco'
import { IconoBorrar, IconoEditar, IconoPlan } from '../components/iconos'
import { useAccion } from '../components/useAccion'
import { useHoy } from '../components/useHoy'
import { useIdeaAConvertir } from '../components/useIdeaAConvertir'
import { centimosATexto, formatearEuros } from '../lib/dinero'
import { formatearFecha, type FechaDia } from '../lib/fechas'
import { notasDeIdea, tituloDeIdea } from '../lib/ideas'
import {
  CON_QUIEN_MAX,
  COMENTARIO_MAX,
  ESTADOS_PLAN,
  esEstadoPlan,
  esTipoPlan,
  estrellas,
  filtrarPlanes,
  NOMBRE_ESTADO_PLAN,
  NOMBRE_TIPO_PLAN,
  NOTAS_PLAN_MAX,
  ordenarPlanes,
  TIPOS_PLAN,
  TITULO_PLAN_MAX,
  type EstadoPlan,
  type Filtro,
  type TipoPlan,
} from '../lib/planes'
import { usePlanes } from '../repos/hooks'
import type { Idea } from '../repos/ideas'
import { borrarPlan, crearPlan, deshacerHecho, editarPlan, marcarHecho, type DatosPlanTexto, type Plan } from '../repos/planes'
import { useEstadoSync } from '../sync/hooks'

type Ejecutar = (accion: () => Promise<unknown>) => Promise<boolean>

const VACIO: DatosPlanTexto = { titulo: '', tipo: 'actividad', con_quien: '', fecha: '', coste: '', notas: '' }

export function Planes() {
  const hoy = useHoy()
  const planes = usePlanes()
  const { primeraDescargaHecha } = useEstadoSync()
  const { error, ejecutar, limpiar } = useAccion()
  const desdeIdea = useIdeaAConvertir()
  const [estado, setEstado] = useState<Filtro<EstadoPlan>>('todos')
  const [tipo, setTipo] = useState<Filtro<TipoPlan>>('todos')
  const id = useId()

  const lista = planes.datos ?? []
  const visibles = ordenarPlanes(filtrarPlanes(lista, estado, tipo))
  const cargando = planes.cargando || (lista.length === 0 && !primeraDescargaHecha)

  return (
    <Pagina titulo="Planes">
      <div className="stack">
        {planes.error && <AvisoError mensaje="No se han podido leer tus planes de este dispositivo. Recarga la página." />}
        <AvisoError mensaje={error} onCerrar={limpiar} />

        {desdeIdea.idea && <AvisoDesdeIdea idea={desdeIdea.idea} que="plan" cancelar={desdeIdea.terminar} />}
        <AltaPlan key={desdeIdea.idea?.id ?? 'nuevo'} ejecutar={ejecutar} idea={desdeIdea.idea} alCrear={desdeIdea.terminar} />

        <section aria-labelledby="planes-lista">
          <h2 id="planes-lista" className="t-section" tabIndex={-1}>
            Tus planes <span className="num muted">{visibles.length}</span>
          </h2>
          {lista.length > 0 && (
            <div className="filtros" role="group" aria-label="Filtrar planes">
              <div className="field">
                <label htmlFor={`${id}-f-estado`} className="field__label">
                  Estado
                </label>
                <select id={`${id}-f-estado`} className="input" value={estado} onChange={(e) => setEstado(e.target.value as Filtro<EstadoPlan>)}>
                  <option value="todos">Todos</option>
                  {ESTADOS_PLAN.map((e) => (
                    <option key={e} value={e}>
                      {NOMBRE_ESTADO_PLAN[e]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`${id}-f-tipo`} className="field__label">
                  Tipo
                </label>
                <select id={`${id}-f-tipo`} className="input" value={tipo} onChange={(e) => setTipo(e.target.value as Filtro<TipoPlan>)}>
                  <option value="todos">Todos</option>
                  {TIPOS_PLAN.map((t) => (
                    <option key={t} value={t}>
                      {NOMBRE_TIPO_PLAN[t]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {cargando && lista.length === 0 ? (
            <div className="stack" role="status" aria-busy="true" style={{ '--gap': 'var(--sp-2)' } as CSSProperties}>
              <span className="visually-hidden">Cargando tus planes…</span>
              <span className="skeleton" style={{ '--h': '3.5rem' } as CSSProperties} />
              <span className="skeleton" style={{ '--h': '3.5rem' } as CSSProperties} />
            </div>
          ) : lista.length === 0 ? (
            <Vacio icono={<IconoPlan />} titulo="Aún no tienes planes">
              Apunta sitios, viajes o actividades que te apetezcan. Cuando les pongas fecha pasan a «Planeado», y al hacerlos puedes valorarlos.
            </Vacio>
          ) : visibles.length === 0 ? (
            <p className="t-small muted" style={{ paddingBlock: 'var(--sp-3)' }}>
              Ningún plan con estos filtros.
            </p>
          ) : (
            <ul className="list" role="list">
              {visibles.map((p) => (
                <FilaPlan key={p.id} plan={p} hoy={hoy} ejecutar={ejecutar} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </Pagina>
  )
}

function CamposPlan({ id, datos, cambiar, autoFocus }: { id: string; datos: DatosPlanTexto; cambiar: (c: Partial<DatosPlanTexto>) => void; autoFocus?: boolean }) {
  return (
    <>
      <div className="alta">
        <div className="field">
          <label htmlFor={`${id}-titulo`} className="field__label">
            Plan
          </label>
          <input
            id={`${id}-titulo`}
            className="input"
            value={datos.titulo}
            maxLength={TITULO_PLAN_MAX}
            placeholder="Ej.: Ruta por los Picos de Europa"
            autoComplete="off"
            autoFocus={autoFocus}
            onChange={(e) => cambiar({ titulo: e.target.value })}
          />
        </div>
        <div className="field field--fecha">
          <label htmlFor={`${id}-tipo`} className="field__label">
            Tipo
          </label>
          <select id={`${id}-tipo`} className="input" value={datos.tipo} onChange={(e) => cambiar({ tipo: e.target.value })}>
            {TIPOS_PLAN.map((t) => (
              <option key={t} value={t}>
                {NOMBRE_TIPO_PLAN[t]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="alta alta--tres">
        <div className="field">
          <label htmlFor={`${id}-quien`} className="field__label">
            Con quién <span className="muted">(opcional)</span>
          </label>
          <input
            id={`${id}-quien`}
            className="input"
            value={datos.con_quien}
            maxLength={CON_QUIEN_MAX}
            placeholder="Ej.: Ana y Leo"
            autoComplete="off"
            onChange={(e) => cambiar({ con_quien: e.target.value })}
          />
        </div>
        <div className="field field--fecha">
          <label htmlFor={`${id}-fecha`} className="field__label">
            Fecha <span className="muted">(opcional)</span>
          </label>
          <input id={`${id}-fecha`} type="date" className="input" value={datos.fecha} aria-describedby={`${id}-fecha-ayuda`} onChange={(e) => cambiar({ fecha: e.target.value })} />
        </div>
        <div className="field field--fecha">
          <label htmlFor={`${id}-coste`} className="field__label">
            Coste aprox. (€)
          </label>
          <input
            id={`${id}-coste`}
            className="input"
            inputMode="decimal"
            autoComplete="off"
            placeholder="Opcional"
            value={datos.coste}
            onChange={(e) => cambiar({ coste: e.target.value })}
          />
        </div>
      </div>
      <p id={`${id}-fecha-ayuda`} className="field__hint">
        Con fecha queda como «Planeado»; sin fecha, como «Idea».
      </p>
      <div className="field">
        <label htmlFor={`${id}-notas`} className="field__label">
          Notas <span className="muted">(opcional)</span>
        </label>
        <textarea id={`${id}-notas`} className="input" rows={2} maxLength={NOTAS_PLAN_MAX} value={datos.notas} onChange={(e) => cambiar({ notas: e.target.value })} />
      </div>
    </>
  )
}

function AltaPlan({ ejecutar, idea, alCrear }: { ejecutar: Ejecutar; idea: Idea | null; alCrear: () => void }) {
  // Si viene de una idea de la bandeja: su primera línea es el título y el resto, las notas
  const inicial = (): DatosPlanTexto => (idea ? { ...VACIO, titulo: tituloDeIdea(idea.texto, TITULO_PLAN_MAX), notas: notasDeIdea(idea.texto) } : VACIO)
  const [datos, setDatos] = useState<DatosPlanTexto>(inicial)
  const id = useId()

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (await ejecutar(() => crearPlan(datos, idea?.id))) {
      setDatos(VACIO)
      if (idea) alCrear()
    }
  }

  return (
    <form className="card stack" style={{ '--gap': 'var(--sp-3)' } as CSSProperties} onSubmit={(e) => void enviar(e)} aria-labelledby={`${id}-alta`}>
      <h2 id={`${id}-alta`} className="t-section">
        Nuevo plan
      </h2>
      <CamposPlan id={id} datos={datos} cambiar={(c) => setDatos((d) => ({ ...d, ...c }))} autoFocus={idea !== null} />
      <div>
        <button type="submit" className="btn btn--primary">
          Añadir plan
        </button>
      </div>
    </form>
  )
}

function FilaPlan({ plan: p, hoy, ejecutar }: { plan: Plan; hoy: FechaDia; ejecutar: Ejecutar }) {
  const [modo, setModo] = useState<'ver' | 'editar' | 'hecho' | 'borrar'>('ver')
  const [datos, setDatos] = useState<DatosPlanTexto>(VACIO)
  const [valoracion, setValoracion] = useState('')
  const [comentario, setComentario] = useState('')
  const id = useId()
  const fila = useRef<HTMLLIElement>(null)
  const botonEditar = useRef<HTMLButtonElement>(null)
  const botonBorrar = useRef<HTMLButtonElement>(null)
  const botonHecho = useRef<HTMLButtonElement>(null)
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

  // Cambiar fecha o estado mueve el plan de sitio: el foco va al título de la lista
  async function cambiar(accion: () => Promise<unknown>) {
    if (await ejecutar(accion)) {
      setModo('ver')
      requestAnimationFrame(() => document.getElementById('planes-lista')?.focus())
    }
  }

  async function borrar() {
    const mover = prepararFoco(fila.current)
    if (await ejecutar(() => borrarPlan(p.id))) mover()
  }

  if (modo === 'editar') {
    return (
      <li className="list__item">
        <form
          className="edicion stack"
          style={{ '--gap': 'var(--sp-3)', paddingBlock: 'var(--sp-2)' } as CSSProperties}
          onSubmit={(e) => {
            e.preventDefault()
            void cambiar(() => editarPlan(p.id, datos))
          }}
          aria-label={`Editar: ${p.titulo}`}
        >
          <CamposPlan id={id} datos={datos} cambiar={(x) => setDatos((d) => ({ ...d, ...x }))} autoFocus />
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

  if (modo === 'hecho') {
    return (
      <li className="list__item">
        <form
          className="edicion stack"
          style={{ '--gap': 'var(--sp-3)', paddingBlock: 'var(--sp-2)' } as CSSProperties}
          onSubmit={(e) => {
            e.preventDefault()
            void cambiar(() => marcarHecho(p.id, valoracion, comentario, hoy))
          }}
          aria-label={`Marcar como hecho: ${p.titulo}`}
        >
          <p className="break" style={{ fontWeight: 'var(--fw-medium)' }}>
            ¿Qué tal «{p.titulo}»?
          </p>
          <fieldset className="grupo">
            <legend className="field__label">
              Valoración <span className="muted">(opcional)</span>
            </legend>
            <div className="segmentos valoracion">
            {['', '1', '2', '3', '4', '5'].map((v) => (
              <label key={v || 'sin'}>
                <input type="radio" name={`${id}-valoracion`} value={v} checked={valoracion === v} onChange={() => setValoracion(v)} />
                {v ? (
                  <>
                    <span aria-hidden="true">{v}★</span>
                    <span className="visually-hidden">{v === '1' ? '1 estrella' : `${v} estrellas`}</span>
                  </>
                ) : (
                  'Sin nota'
                )}
              </label>
            ))}
            </div>
          </fieldset>
          <div className="field">
            <label htmlFor={`${id}-comentario`} className="field__label">
              Comentario <span className="muted">(opcional)</span>
            </label>
            <textarea id={`${id}-comentario`} className="input" rows={2} maxLength={COMENTARIO_MAX} value={comentario} onChange={(e) => setComentario(e.target.value)} />
          </div>
          <div className="row">
            <button type="submit" className="btn btn--primary">
              Marcar como hecho
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => volver(botonHecho)}>
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
          <span className="break">¿Borrar «{p.titulo}»?</span>
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

  const estado = esEstadoPlan(p.estado) ? p.estado : 'idea'
  const tipo = esTipoPlan(p.tipo) ? NOMBRE_TIPO_PLAN[p.tipo] : 'Otro'
  const detalles = [
    tipo,
    p.con_quien && `con ${p.con_quien}`,
    p.coste_centimos !== null && p.coste_centimos !== undefined && `≈ ${formatearEuros(p.coste_centimos)}`,
  ].filter(Boolean)

  return (
    <li className="list__item plan" ref={fila}>
      <div className="list__main">
        <p className="row" style={{ '--gap': 'var(--sp-2)' } as CSSProperties}>
          <span className={`tag plan__estado plan__estado--${estado}`}>{NOMBRE_ESTADO_PLAN[estado]}</span>
          {p.fecha && (
            <span className={`t-small num${estado === 'planeado' && p.fecha < hoy ? ' text-warn' : ' muted'}`}>
              {formatearFecha(p.fecha)}
              {estado === 'planeado' && p.fecha < hoy && ' · ya pasó'}
            </span>
          )}
        </p>
        <p className="break" style={{ fontWeight: 'var(--fw-medium)' }}>
          {p.titulo}
        </p>
        <p className="t-small muted break">{detalles.join(' · ')}</p>
        {estado === 'hecho' && (p.valoracion || p.comentario) && (
          <p className="t-small">
            {p.valoracion && (
              <>
                <span className="plan__estrellas" aria-hidden="true">
                  {estrellas(p.valoracion)}
                </span>
                <span className="visually-hidden">Valoración: {p.valoracion} de 5.</span>
              </>
            )}
            {p.comentario && <span className="muted"> {p.comentario}</span>}
          </p>
        )}
        {p.notas && <p className="t-small muted cliente__notas">{p.notas}</p>}
      </div>
      <div className="acciones">
        {estado === 'hecho' ? (
          <button type="button" ref={botonHecho} className="btn btn--ghost" onClick={() => void cambiar(() => deshacerHecho(p.id))}>
            Deshacer
          </button>
        ) : (
          <button
            type="button"
            ref={botonHecho}
            className="btn btn--ghost"
            onClick={() => {
              setValoracion('')
              setComentario('')
              setModo('hecho')
            }}
          >
            Hecho
          </button>
        )}
        <button
          type="button"
          ref={botonEditar}
          className="icon-btn"
          aria-label={`Editar: ${p.titulo}`}
          onClick={() => {
            setDatos({
              titulo: p.titulo,
              tipo: esTipoPlan(p.tipo) ? p.tipo : 'otro',
              con_quien: p.con_quien,
              fecha: p.fecha ?? '',
              coste: p.coste_centimos !== null && p.coste_centimos !== undefined ? centimosATexto(p.coste_centimos) : '',
              notas: p.notas,
            })
            setModo('editar')
          }}
        >
          <IconoEditar />
        </button>
        <button type="button" ref={botonBorrar} className="icon-btn icon-btn--peligro" aria-label={`Borrar: ${p.titulo}`} onClick={() => setModo('borrar')}>
          <IconoBorrar />
        </button>
      </div>
    </li>
  )
}
