// Lista de deseos conectada al ahorro de Dinero: en orden de prioridad, cada
// artículo dice «te llega» o «te faltan X €», con su barra. Al comprarlo se
// ofrece apuntar el gasto y pasa al historial. Una idea llega como ?idea=<id>.

import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type RefObject } from 'react'
import { AvisoError } from '../components/AvisoError'
import { AvisoDesdeIdea } from '../components/DesdeIdea'
import { Pagina } from '../components/Pagina'
import { Vacio } from '../components/Vacio'
import { prepararFoco } from '../components/foco'
import { IconoBorrar, IconoDeseo, IconoEditar, IconoExterno } from '../components/iconos'
import { useAccion } from '../components/useAccion'
import { useHoy } from '../components/useHoy'
import { useIdeaAConvertir } from '../components/useIdeaAConvertir'
import {
  ARTICULO_MAX,
  enlaceSeguro,
  esPrioridad,
  historial,
  NOMBRE_PRIORIDAD,
  NOTAS_DESEO_MAX,
  PRIORIDADES,
  repartirAhorro,
  type DeseoConAhorro,
} from '../lib/deseos'
import { centimosATexto, formatearEuros, resumir } from '../lib/dinero'
import { formatearFecha, type FechaDia } from '../lib/fechas'
import { notasDeIdea, tituloDeIdea } from '../lib/ideas'
import { borrarDeseo, crearDeseo, devolverALista, editarDeseo, marcarComprado, type DatosDeseoTexto, type Deseo } from '../repos/deseos'
import { useDeseos, useMovimientos } from '../repos/hooks'
import type { Idea } from '../repos/ideas'
import { useEstadoSync } from '../sync/hooks'

type Ejecutar = (accion: () => Promise<unknown>) => Promise<boolean>

const VACIO: DatosDeseoTexto = { articulo: '', precio: '', prioridad: 'media', enlace: '', notas: '' }

export function Deseos() {
  const hoy = useHoy()
  const deseos = useDeseos()
  const movimientos = useMovimientos()
  const { primeraDescargaHecha } = useEstadoSync()
  const { error, ejecutar, limpiar } = useAccion()
  const desdeIdea = useIdeaAConvertir()

  const lista = deseos.datos ?? []
  const ahorro = resumir(movimientos.datos ?? []).ahorro
  const pendientes = repartirAhorro(lista, ahorro)
  const comprados = historial(lista)
  const cargando = deseos.cargando || movimientos.cargando || (lista.length === 0 && !primeraDescargaHecha)

  return (
    <Pagina titulo="Lista de deseos">
      <div className="stack">
        {deseos.error && <AvisoError mensaje="No se ha podido leer tu lista de deseos de este dispositivo. Recarga la página." />}
        <AvisoError mensaje={error} onCerrar={limpiar} />

        {desdeIdea.idea && <AvisoDesdeIdea idea={desdeIdea.idea} que="deseo" cancelar={desdeIdea.terminar} />}
        <AltaDeseo key={desdeIdea.idea?.id ?? 'nuevo'} ejecutar={ejecutar} idea={desdeIdea.idea} alCrear={desdeIdea.terminar} />

        <section aria-labelledby="deseos-lista">
          <div className="row row--between">
            <h2 id="deseos-lista" className="t-section" tabIndex={-1}>
              Por prioridad <span className="num muted">{pendientes.length}</span>
            </h2>
            {!cargando && (
              <p className="t-small muted">
                Ahorro total <span className={`num${ahorro < 0 ? ' text-danger' : ''}`}>{formatearEuros(ahorro)}</span>
              </p>
            )}
          </div>
          {cargando && lista.length === 0 ? (
            <div className="stack" role="status" aria-busy="true" style={{ '--gap': 'var(--sp-2)' } as CSSProperties}>
              <span className="visually-hidden">Cargando tu lista de deseos…</span>
              <span className="skeleton" style={{ '--h': '4rem' } as CSSProperties} />
              <span className="skeleton" style={{ '--h': '4rem' } as CSSProperties} />
            </div>
          ) : pendientes.length === 0 ? (
            <Vacio icono={<IconoDeseo />} titulo={comprados.length ? 'Nada pendiente' : 'Tu lista está vacía'}>
              Apunta lo que quieres comprar y su prioridad: con lo que llevas ahorrado en Dinero te digo a cuáles te llega y cuánto te falta para
              el resto.
            </Vacio>
          ) : (
            <ul className="list" role="list">
              {pendientes.map((p) => (
                <FilaDeseo key={p.deseo.id} item={p} hoy={hoy} ejecutar={ejecutar} />
              ))}
            </ul>
          )}
        </section>

        {comprados.length > 0 && (
          <details className="card fijos">
            <summary>
              <span className="t-section">
                Comprados <span className="num muted">{comprados.length}</span>
              </span>
            </summary>
            <ul className="list" role="list" style={{ marginTop: 'var(--sp-2)' }}>
              {comprados.map((d) => (
                <FilaComprado key={d.id} deseo={d} ejecutar={ejecutar} />
              ))}
            </ul>
          </details>
        )}
      </div>
    </Pagina>
  )
}

function CamposDeseo({ id, datos, cambiar, autoFocus }: { id: string; datos: DatosDeseoTexto; cambiar: (c: Partial<DatosDeseoTexto>) => void; autoFocus?: boolean }) {
  return (
    <>
      <div className="alta">
        <div className="field">
          <label htmlFor={`${id}-articulo`} className="field__label">
            Artículo
          </label>
          <input
            id={`${id}-articulo`}
            className="input"
            value={datos.articulo}
            maxLength={ARTICULO_MAX}
            placeholder="Ej.: Auriculares inalámbricos"
            autoComplete="off"
            autoFocus={autoFocus}
            onChange={(e) => cambiar({ articulo: e.target.value })}
          />
        </div>
        <div className="field field--fecha">
          <label htmlFor={`${id}-precio`} className="field__label">
            Precio (€)
          </label>
          <input
            id={`${id}-precio`}
            className="input"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            value={datos.precio}
            onChange={(e) => cambiar({ precio: e.target.value })}
          />
        </div>
      </div>
      {/* La leyenda visible va fuera del carril gris del selector */}
      <fieldset className="grupo">
        <legend className="field__label">Prioridad</legend>
        <div className="segmentos">
          {PRIORIDADES.map((p) => (
            <label key={p}>
              <input type="radio" name={`${id}-prioridad`} value={p} checked={datos.prioridad === p} onChange={() => cambiar({ prioridad: p })} />
              {NOMBRE_PRIORIDAD[p]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor={`${id}-enlace`} className="field__label">
          Enlace <span className="muted">(opcional)</span>
        </label>
        <input
          id={`${id}-enlace`}
          className="input"
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://…"
          value={datos.enlace}
          onChange={(e) => cambiar({ enlace: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-notas`} className="field__label">
          Notas <span className="muted">(opcional)</span>
        </label>
        <textarea id={`${id}-notas`} className="input" rows={2} maxLength={NOTAS_DESEO_MAX} value={datos.notas} onChange={(e) => cambiar({ notas: e.target.value })} />
      </div>
    </>
  )
}

function AltaDeseo({ ejecutar, idea, alCrear }: { ejecutar: Ejecutar; idea: Idea | null; alCrear: () => void }) {
  const inicial = (): DatosDeseoTexto => (idea ? { ...VACIO, articulo: tituloDeIdea(idea.texto, ARTICULO_MAX), notas: notasDeIdea(idea.texto) } : VACIO)
  const [datos, setDatos] = useState<DatosDeseoTexto>(inicial)
  const id = useId()

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (await ejecutar(() => crearDeseo(datos, idea?.id))) {
      setDatos(VACIO)
      if (idea) alCrear()
    }
  }

  return (
    <form className="card stack" style={{ '--gap': 'var(--sp-3)' } as CSSProperties} onSubmit={(e) => void enviar(e)} aria-labelledby={`${id}-alta`} noValidate>
      <h2 id={`${id}-alta`} className="t-section">
        Quiero comprar…
      </h2>
      <CamposDeseo id={id} datos={datos} cambiar={(c) => setDatos((d) => ({ ...d, ...c }))} autoFocus={idea !== null} />
      <div>
        <button type="submit" className="btn btn--primary">
          Añadir a la lista
        </button>
      </div>
    </form>
  )
}

function Enlace({ url, articulo }: { url: string | null; articulo: string }) {
  const seguro = enlaceSeguro(url)
  if (!seguro) return null
  return (
    <a href={seguro} target="_blank" rel="noopener noreferrer nofollow" className="t-small deseo__enlace">
      Ver en la tienda
      <IconoExterno />
      <span className="visually-hidden"> de {articulo} (se abre en otra pestaña)</span>
    </a>
  )
}

function FilaDeseo({ item, hoy, ejecutar }: { item: DeseoConAhorro<Deseo>; hoy: FechaDia; ejecutar: Ejecutar }) {
  const d = item.deseo
  const [modo, setModo] = useState<'ver' | 'editar' | 'comprar' | 'borrar'>('ver')
  const [datos, setDatos] = useState<DatosDeseoTexto>(VACIO)
  const id = useId()
  const fila = useRef<HTMLLIElement>(null)
  const botonEditar = useRef<HTMLButtonElement>(null)
  const botonBorrar = useRef<HTMLButtonElement>(null)
  const botonComprar = useRef<HTMLButtonElement>(null)
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

  // Comprar o borrar lo saca de la lista: el foco pasa al vecino
  async function sacar(accion: () => Promise<unknown>) {
    const mover = prepararFoco(fila.current)
    if (await ejecutar(accion)) mover()
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    // Cambiar prioridad o precio lo puede mover de sitio: el foco va al título
    if (await ejecutar(() => editarDeseo(d.id, datos))) {
      setModo('ver')
      requestAnimationFrame(() => document.getElementById('deseos-lista')?.focus())
    }
  }

  if (modo === 'editar') {
    return (
      <li className="list__item">
        <form className="edicion stack" style={{ '--gap': 'var(--sp-3)', paddingBlock: 'var(--sp-2)' } as CSSProperties} onSubmit={(e) => void guardar(e)} aria-label={`Editar: ${d.articulo}`} noValidate>
          <CamposDeseo id={id} datos={datos} cambiar={(x) => setDatos((v) => ({ ...v, ...x }))} autoFocus />
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

  if (modo === 'comprar') {
    return (
      <li className="list__item" ref={fila}>
        <div className="stack list__main" style={{ '--gap': 'var(--sp-2)', paddingBlock: 'var(--sp-2)' } as CSSProperties} role="group" aria-label={`Comprado: ${d.articulo}`}>
          <p className="break">
            ¿Apunto en Dinero el gasto de <span className="num">{formatearEuros(d.precio_centimos)}</span> por «{d.articulo}»?
          </p>
          <div className="row">
            <button type="button" className="btn btn--primary" autoFocus onClick={() => void sacar(() => marcarComprado(d.id, true, hoy))}>
              Sí, apuntar el gasto
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => void sacar(() => marcarComprado(d.id, false, hoy))}>
              No, solo marcarlo
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => volver(botonComprar)}>
              Cancelar
            </button>
          </div>
        </div>
      </li>
    )
  }

  if (modo === 'borrar') {
    return (
      <li className="list__item" ref={fila}>
        <div className="confirmar list__main">
          <span className="break">¿Quitar «{d.articulo}» de la lista?</span>
          <button type="button" className="btn btn--danger" onClick={() => void sacar(() => borrarDeseo(d.id))}>
            Borrar
          </button>
          <button type="button" className="btn btn--ghost" autoFocus onClick={() => volver(botonBorrar)}>
            Cancelar
          </button>
        </div>
      </li>
    )
  }

  const prioridad = esPrioridad(d.prioridad) ? d.prioridad : 'media'
  return (
    <li className="list__item deseo" ref={fila}>
      <div className="list__main stack" style={{ '--gap': 'var(--sp-1)' } as CSSProperties}>
        <div className="row row--between" style={{ alignItems: 'baseline' }}>
          <p className="break" style={{ fontWeight: 'var(--fw-medium)' }}>
            <span className={`tag deseo__prioridad deseo__prioridad--${prioridad}`}>{NOMBRE_PRIORIDAD[prioridad]}</span> {d.articulo}
          </p>
          <span className="num">{formatearEuros(d.precio_centimos)}</span>
        </div>
        <div
          className={`progress${item.teLlega ? ' progress--ok' : ''}`}
          role="progressbar"
          aria-label={`Ahorro para ${d.articulo}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={item.porcentaje}
          aria-valuetext={item.teLlega ? 'Te llega' : `${item.porcentaje} %, te faltan ${formatearEuros(item.falta)}`}
          style={{ '--p': `${item.porcentaje}%` } as CSSProperties}
        />
        <p className="t-small">
          {item.teLlega ? (
            <span className="text-ok">Te llega</span>
          ) : (
            <>
              Te faltan <span className="num">{formatearEuros(item.falta)}</span> <span className="muted">· {item.porcentaje} %</span>
            </>
          )}
        </p>
        {(d.enlace || d.notas) && (
          <div className="stack" style={{ '--gap': '2px' } as CSSProperties}>
            <Enlace url={d.enlace} articulo={d.articulo} />
            {d.notas && <p className="t-small muted cliente__notas">{d.notas}</p>}
          </div>
        )}
      </div>
      <div className="acciones">
        <button type="button" ref={botonComprar} className="btn btn--ghost" onClick={() => setModo('comprar')}>
          Comprado
        </button>
        <button
          type="button"
          ref={botonEditar}
          className="icon-btn"
          aria-label={`Editar: ${d.articulo}`}
          onClick={() => {
            setDatos({ articulo: d.articulo, precio: centimosATexto(d.precio_centimos), prioridad, enlace: d.enlace ?? '', notas: d.notas })
            setModo('editar')
          }}
        >
          <IconoEditar />
        </button>
        <button type="button" ref={botonBorrar} className="icon-btn icon-btn--peligro" aria-label={`Borrar: ${d.articulo}`} onClick={() => setModo('borrar')}>
          <IconoBorrar />
        </button>
      </div>
    </li>
  )
}

function FilaComprado({ deseo: d, ejecutar }: { deseo: Deseo; ejecutar: Ejecutar }) {
  const fila = useRef<HTMLLIElement>(null)
  async function sacar(accion: () => Promise<unknown>) {
    const mover = prepararFoco(fila.current)
    if (await ejecutar(accion)) mover()
  }
  return (
    <li className="list__item deseo" ref={fila}>
      <div className="list__main">
        <p className="break">{d.articulo}</p>
        <p className="t-small muted">
          <span className="num">{formatearEuros(d.precio_centimos)}</span>
          {d.comprado_en && (
            <>
              {' · comprado el '}
              <span className="num">{formatearFecha(d.comprado_en)}</span>
            </>
          )}
        </p>
      </div>
      <div className="acciones">
        <button type="button" className="btn btn--ghost" aria-label={`Devolver a la lista: ${d.articulo}`} onClick={() => void sacar(() => devolverALista(d.id))}>
          Devolver
        </button>
        <button type="button" className="icon-btn icon-btn--peligro" aria-label={`Borrar del historial: ${d.articulo}`} onClick={() => void sacar(() => borrarDeseo(d.id))}>
          <IconoBorrar />
        </button>
      </div>
    </li>
  )
}
