// Una lista de la compra (vale para «Mi lista» y para la «Lista de casa»):
// apuntar con sugerencias, artículos agrupados por sección, marcar de un
// toque, editar, borrar y «Quitar los comprados» con confirmación.

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { CANTIDAD_MAX, NOMBRE_MAX, NOTAS_MAX, SECCIONES, agruparPorSeccion, sugerencias, yaPendiente, type ArticuloBasico, type Frecuente } from '../lib/compra'
import { Vacio } from './Vacio'
import { prepararFoco } from './foco'
import { IconoBorrar, IconoCarrito, IconoEditar } from './iconos'

type Ejecutar = (accion: () => Promise<unknown>) => Promise<boolean>

export interface Articulo extends ArticuloBasico {
  notas: string
}

export interface DatosFormulario {
  nombre: string
  cantidad: string
  seccion: string
  notas: string
}

interface Props<A extends Articulo> {
  /** Para los id del HTML: 'mia' o 'casa'. */
  id: string
  articulos: readonly A[]
  frecuentes: readonly Frecuente[]
  cargando: boolean
  ejecutar: Ejecutar
  apuntar: (datos: DatosFormulario) => Promise<unknown>
  editar: (id: string, datos: DatosFormulario) => Promise<unknown>
  marcar: (id: string, comprado: boolean) => Promise<unknown>
  borrar: (id: string) => Promise<unknown>
  quitarComprados: () => Promise<number>
  /** Texto extra de cada artículo (p. ej. «Lo marcó Ana»). */
  detalle?: (articulo: A) => ReactNode
  vacio: { titulo: string; texto: string }
}

export function ListaCompra<A extends Articulo>(props: Props<A>) {
  const { id, articulos, cargando, ejecutar } = props
  const { pendientes, comprados } = useMemo(() => agruparPorSeccion(articulos), [articulos])
  const totalPendientes = pendientes.reduce((n, g) => n + g.articulos.length, 0)

  return (
    <div className="stack">
      <Apuntar {...props} />

      {cargando && articulos.length === 0 ? (
        <div className="stack" role="status" aria-busy="true" style={{ '--gap': 'var(--sp-2)' } as CSSProperties}>
          <span className="visually-hidden">Cargando la lista…</span>
          <span className="skeleton" style={{ '--h': '3.5rem' } as CSSProperties} />
          <span className="skeleton" style={{ '--h': '3.5rem' } as CSSProperties} />
        </div>
      ) : totalPendientes === 0 && comprados.length === 0 ? (
        <Vacio icono={<IconoCarrito />} titulo={props.vacio.titulo}>
          {props.vacio.texto}
        </Vacio>
      ) : (
        <>
          <p className="muted" role="status">
            {totalPendientes === 0 ? 'Nada pendiente.' : totalPendientes === 1 ? '1 cosa por comprar.' : `${totalPendientes} cosas por comprar.`}
          </p>
          {pendientes.map((g) => (
            <section key={g.seccion ?? 'sin'} aria-labelledby={`${id}-sec-${g.seccion ?? 'sin'}`} className="compra-seccion">
              <h2 id={`${id}-sec-${g.seccion ?? 'sin'}`} className="t-section" tabIndex={-1}>
                {g.nombre} <span className="num muted">{g.articulos.length}</span>
              </h2>
              <ul className="list" role="list">
                {g.articulos.map((a) => (
                  <FilaArticulo key={a.id} articulo={a} props={props} />
                ))}
              </ul>
            </section>
          ))}
          {comprados.length > 0 && <Comprados comprados={comprados} props={props} ejecutar={ejecutar} />}
        </>
      )}
    </div>
  )
}

function Apuntar<A extends Articulo>({ id, articulos, frecuentes, ejecutar, apuntar }: Props<A>) {
  const [nombre, setNombre] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [seccion, setSeccion] = useState('')
  const [masCampos, setMasCampos] = useState(false)
  const [notas, setNotas] = useState('')
  const campo = useRef<HTMLInputElement>(null)
  const ideas = useMemo(() => (nombre.trim() ? sugerencias(nombre, frecuentes, articulos) : []), [nombre, frecuentes, articulos])
  const repetido = nombre.trim() ? yaPendiente(nombre, articulos) : undefined

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const ok = await ejecutar(() => apuntar({ nombre, cantidad, seccion, notas }))
    if (ok) {
      setNombre('')
      setCantidad('')
      setNotas('')
      setSeccion('')
      campo.current?.focus()
    }
  }

  return (
    <form className="card stack compra-apuntar" onSubmit={(e) => void enviar(e)} aria-label="Apuntar en la lista" style={{ '--gap': 'var(--sp-3)' } as CSSProperties}>
      <div className="compra-apuntar__fila">
        <div className="field">
          <label htmlFor={`${id}-nombre`} className="field__label">
            Qué hay que comprar
          </label>
          <input
            id={`${id}-nombre`}
            ref={campo}
            className="input"
            value={nombre}
            maxLength={NOMBRE_MAX * 2}
            placeholder="Ej.: Leche"
            autoComplete="off"
            enterKeyHint="done"
            aria-describedby={repetido ? `${id}-repetido` : undefined}
            onChange={(e) => setNombre(e.target.value)}
          />
        </div>
        <div className="field compra-apuntar__cantidad">
          <label htmlFor={`${id}-cantidad`} className="field__label">
            Cantidad <span className="muted">(opcional)</span>
          </label>
          <input id={`${id}-cantidad`} className="input" value={cantidad} maxLength={CANTIDAD_MAX} placeholder="2 l" onChange={(e) => setCantidad(e.target.value)} />
        </div>
      </div>

      {repetido && (
        <p id={`${id}-repetido`} className="t-small text-warn">
          Ya está en la lista{repetido.cantidad ? ` (${repetido.cantidad})` : ''}.
        </p>
      )}

      {ideas.length > 0 && (
        <div className="compra-sugerencias" role="group" aria-label="Sugerencias de lo que más compras">
          {ideas.map((s) => (
            <button
              key={s.nombre}
              type="button"
              className="tag compra-sugerencias__item"
              onClick={() => {
                setNombre(s.nombre)
                if (s.seccion && !seccion) setSeccion(s.seccion)
                campo.current?.focus()
              }}
            >
              {s.nombre}
            </button>
          ))}
        </div>
      )}

      <div className="field">
        <label htmlFor={`${id}-seccion`} className="field__label">
          Sección <span className="muted">(opcional)</span>
        </label>
        <select id={`${id}-seccion`} className="input" value={seccion} onChange={(e) => setSeccion(e.target.value)}>
          <option value="">Sin sección</option>
          {SECCIONES.map((s) => (
            <option key={s.clave} value={s.clave}>
              {s.nombre}
            </option>
          ))}
        </select>
      </div>

      {masCampos ? (
        <div className="field">
          <label htmlFor={`${id}-notas`} className="field__label">
            Notas <span className="muted">(opcional)</span>
          </label>
          <textarea id={`${id}-notas`} className="input" rows={2} value={notas} maxLength={NOTAS_MAX} onChange={(e) => setNotas(e.target.value)} />
        </div>
      ) : null}

      <div className="row row--between">
        <button type="button" className="btn btn--ghost btn--sm compra-apuntar__mas" aria-expanded={masCampos} onClick={() => setMasCampos((v) => !v)}>
          {masCampos ? 'Sin notas' : 'Añadir notas'}
        </button>
        <button type="submit" className="btn btn--primary" disabled={!nombre.trim()}>
          Apuntar
        </button>
      </div>
    </form>
  )
}

function FilaArticulo<A extends Articulo>({ articulo: a, props }: { articulo: A; props: Props<A> }) {
  const [modo, setModo] = useState<'ver' | 'editar' | 'borrar'>('ver')
  const fila = useRef<HTMLLIElement>(null)
  const botonEditar = useRef<HTMLButtonElement>(null)
  const botonBorrar = useRef<HTMLButtonElement>(null)
  const volverA = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (modo !== 'ver' || !volverA.current) return
    volverA.current.focus()
    volverA.current = null
  }, [modo])

  async function sacar(accion: () => Promise<unknown>) {
    const mover = prepararFoco(fila.current)
    if (await props.ejecutar(accion)) mover()
  }

  if (modo === 'editar') {
    return (
      <li className="list__item" ref={fila}>
        <EditarArticulo
          id={`${props.id}-${a.id}`}
          articulo={a}
          onGuardar={async (datos) => {
            if (await props.ejecutar(() => props.editar(a.id, datos))) {
              volverA.current = botonEditar.current
              setModo('ver')
            }
          }}
          onCancelar={() => {
            volverA.current = botonEditar.current
            setModo('ver')
          }}
        />
      </li>
    )
  }

  if (modo === 'borrar') {
    return (
      <li className="list__item" ref={fila}>
        <div className="confirmar list__main">
          <span className="break">¿Quitar «{a.nombre}» de la lista?</span>
          <button type="button" className="btn btn--danger" onClick={() => void sacar(() => props.borrar(a.id))}>
            Quitar
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            autoFocus
            onClick={() => {
              volverA.current = botonBorrar.current
              setModo('ver')
            }}
          >
            Cancelar
          </button>
        </div>
      </li>
    )
  }

  const detalle = props.detalle?.(a)
  return (
    <li className={`list__item compra-articulo${a.comprado ? ' compra-articulo--comprado' : ''}`} ref={fila}>
      <button
        type="button"
        className="check"
        aria-pressed={a.comprado}
        aria-label={`Comprado: ${a.nombre}${a.cantidad ? ` (${a.cantidad})` : ''}`}
        onClick={() => void props.ejecutar(() => props.marcar(a.id, !a.comprado))}
      />
      <div className="list__main">
        <p className="break">
          <span className="compra-articulo__nombre">{a.nombre}</span>
          {a.cantidad && <span className="compra-articulo__cantidad num muted"> · {a.cantidad}</span>}
        </p>
        {(a.notas || detalle) && (
          <p className="t-small muted compra-articulo__detalle break">
            {a.notas}
            {a.notas && detalle ? ' · ' : null}
            {detalle}
          </p>
        )}
      </div>
      <div className="acciones">
        <button type="button" ref={botonEditar} className="icon-btn" aria-label={`Editar: ${a.nombre}`} onClick={() => setModo('editar')}>
          <IconoEditar />
        </button>
        <button type="button" ref={botonBorrar} className="icon-btn icon-btn--peligro" aria-label={`Quitar: ${a.nombre}`} onClick={() => setModo('borrar')}>
          <IconoBorrar />
        </button>
      </div>
    </li>
  )
}

function EditarArticulo({ id, articulo, onGuardar, onCancelar }: { id: string; articulo: Articulo; onGuardar: (d: DatosFormulario) => Promise<void>; onCancelar: () => void }) {
  const [datos, setDatos] = useState<DatosFormulario>({
    nombre: articulo.nombre,
    cantidad: articulo.cantidad ?? '',
    seccion: articulo.seccion ?? '',
    notas: articulo.notas,
  })
  const cambiar = (campo: keyof DatosFormulario) => (e: { target: { value: string } }) => setDatos((d) => ({ ...d, [campo]: e.target.value }))
  const uid = useId()
  return (
    <form
      className="edicion stack list__main"
      aria-label={`Editar ${articulo.nombre}`}
      style={{ '--gap': 'var(--sp-3)' } as CSSProperties}
      onSubmit={(e) => {
        e.preventDefault()
        void onGuardar(datos)
      }}
    >
      <div className="field">
        <label htmlFor={`${uid}-n`} className="field__label">
          Nombre
        </label>
        <input id={`${uid}-n`} className="input" value={datos.nombre} maxLength={NOMBRE_MAX * 2} autoFocus onChange={cambiar('nombre')} />
      </div>
      <div className="field">
        <label htmlFor={`${uid}-c`} className="field__label">
          Cantidad
        </label>
        <input id={`${uid}-c`} className="input" value={datos.cantidad} maxLength={CANTIDAD_MAX} onChange={cambiar('cantidad')} />
      </div>
      <div className="field">
        <label htmlFor={`${uid}-s`} className="field__label">
          Sección
        </label>
        <select id={`${uid}-s`} className="input" value={datos.seccion} onChange={cambiar('seccion')}>
          <option value="">Sin sección</option>
          {SECCIONES.map((s) => (
            <option key={s.clave} value={s.clave}>
              {s.nombre}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${uid}-o`} className="field__label">
          Notas
        </label>
        <textarea id={`${uid}-o`} className="input" rows={2} value={datos.notas} maxLength={NOTAS_MAX} onChange={cambiar('notas')} />
      </div>
      <div className="row" data-id={id}>
        <button type="submit" className="btn btn--primary">
          Guardar
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function Comprados<A extends Articulo>({ comprados, props, ejecutar }: { comprados: A[]; props: Props<A>; ejecutar: Ejecutar }) {
  const [confirmando, setConfirmando] = useState(false)
  const boton = useRef<HTMLButtonElement>(null)
  return (
    <section aria-labelledby={`${props.id}-comprados`} className="compra-seccion compra-seccion--comprados">
      <div className="row row--between">
        <h2 id={`${props.id}-comprados`} className="t-section" tabIndex={-1}>
          Comprados <span className="num muted">{comprados.length}</span>
        </h2>
        {!confirmando && (
          <button type="button" ref={boton} className="btn btn--ghost btn--sm" onClick={() => setConfirmando(true)}>
            Quitar los comprados
          </button>
        )}
      </div>
      {confirmando && (
        <div className="confirmar" role="group" aria-label="Confirmar">
          <span>
            ¿Quitar {comprados.length === 1 ? 'el artículo comprado' : `los ${comprados.length} artículos comprados`} de la lista?
          </span>
          <button
            type="button"
            className="btn btn--danger"
            onClick={() =>
              void ejecutar(async () => {
                await props.quitarComprados()
                setConfirmando(false)
              })
            }
          >
            Quitar
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            autoFocus
            onClick={() => {
              setConfirmando(false)
              requestAnimationFrame(() => boton.current?.focus())
            }}
          >
            Cancelar
          </button>
        </div>
      )}
      <ul className="list" role="list">
        {comprados.map((a) => (
          <FilaArticulo key={a.id} articulo={a} props={props} />
        ))}
      </ul>
    </section>
  )
}
