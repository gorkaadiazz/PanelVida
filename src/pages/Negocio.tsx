import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type RefObject } from 'react'
import { AvisoError } from '../components/AvisoError'
import { Pagina } from '../components/Pagina'
import { Vacio } from '../components/Vacio'
import { prepararFoco } from '../components/foco'
import { IconoBorrar, IconoEditar, IconoFlecha, IconoNegocio } from '../components/iconos'
import { useAccion } from '../components/useAccion'
import { centimosATexto, formatearEuros } from '../lib/dinero'
import {
  ESTADOS,
  NOMBRE_CLIENTE_MAX,
  NOMBRE_ESTADO,
  NOTAS_MAX,
  clientesDe,
  esEstado,
  estadoVecino,
  resumenNegocio,
  type EstadoCliente,
} from '../lib/negocio'
import { borrarCliente, crearCliente, editarCliente, moverCliente, type Cliente, type DatosCliente } from '../repos/clientes'
import { useClientes } from '../repos/hooks'
import { useEstadoSync } from '../sync/hooks'

type Ejecutar = (accion: () => Promise<unknown>) => Promise<boolean>

export function Negocio() {
  const clientes = useClientes()
  const { primeraDescargaHecha } = useEstadoSync()
  const { error, ejecutar, limpiar } = useAccion()

  const lista = clientes.datos ?? []
  const cargando = clientes.cargando || (lista.length === 0 && !primeraDescargaHecha)
  const resumen = resumenNegocio(lista)
  // Mientras llega la primera copia, las tarjetas no enseñan ceros que no son reales
  const sinDatos = cargando && lista.length === 0 && !clientes.error
  const hueco = (ancho: string, alto = '2rem') => <span className="skeleton" aria-hidden="true" style={{ '--h': alto, '--w': ancho } as CSSProperties} />

  return (
    <Pagina titulo="Negocio">
      <div className="stack">
        {clientes.error && <AvisoError mensaje="No se han podido leer tus clientes de este dispositivo. Recarga la página." />}
        <AvisoError mensaje={error} onCerrar={limpiar} />

        <div className="grid-cards">
          <section className="card" aria-labelledby="negocio-facturado">
            <h2 id="negocio-facturado" className="card__titulo" style={{ marginBottom: 'var(--sp-2)' }}>
              Facturado
            </h2>
            {sinDatos ? (
              hueco('9rem')
            ) : (
              <>
                <p className="num num--xl">{formatearEuros(resumen.facturado)}</p>
                <dl className="cifras" style={{ marginTop: 'var(--sp-3)' }}>
                  <dt>En curso</dt>
                  <dd className="num">{formatearEuros(resumen.enCurso)}</dd>
                </dl>
              </>
            )}
          </section>
          <section className="card" aria-labelledby="negocio-estados">
            <h2 id="negocio-estados" className="card__titulo" style={{ marginBottom: 'var(--sp-2)' }}>
              Clientes
            </h2>
            {sinDatos ? hueco('100%', '6rem') : (
            <dl className="cifras">
              {ESTADOS.map((e) => (
                <div key={e} style={{ display: 'contents' }}>
                  <dt>{NOMBRE_ESTADO[e]}</dt>
                  <dd className="num">{resumen.porEstado[e]}</dd>
                </div>
              ))}
            </dl>
            )}
          </section>
        </div>

        <AltaCliente ejecutar={ejecutar} />

        {clientes.error && lista.length === 0 ? null : sinDatos ? (
          <div className="stack" role="status" aria-busy="true" style={{ '--gap': 'var(--sp-2)' } as CSSProperties}>
            <span className="visually-hidden">Cargando tus clientes…</span>
            <span className="skeleton" style={{ '--h': '3.5rem' } as CSSProperties} />
            <span className="skeleton" style={{ '--h': '3.5rem' } as CSSProperties} />
          </div>
        ) : lista.length === 0 ? (
          <Vacio icono={<IconoNegocio />} titulo="Aún no tienes clientes">
            Apunta arriba a quien te pida una web y muévelo de estado según avance: Contacto, Propuesta, En curso y Entregado.
          </Vacio>
        ) : (
          ESTADOS.map((estado) => <Columna key={estado} estado={estado} clientes={clientesDe(lista, estado)} ejecutar={ejecutar} />)
        )}
      </div>
    </Pagina>
  )
}

function Columna({ estado, clientes, ejecutar }: { estado: EstadoCliente; clientes: Cliente[]; ejecutar: Ejecutar }) {
  const id = `negocio-${estado}`
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="t-section" tabIndex={-1}>
        {NOMBRE_ESTADO[estado]} <span className="num muted">{clientes.length}</span>
      </h2>
      {clientes.length === 0 ? (
        <p className="t-small muted" style={{ paddingBlock: 'var(--sp-2)' }}>
          Ninguno.
        </p>
      ) : (
        <ul className="list" role="list">
          {clientes.map((c) => (
            <FilaCliente key={c.id} cliente={c} ejecutar={ejecutar} />
          ))}
        </ul>
      )}
    </section>
  )
}

function CamposCliente({
  id,
  datos,
  cambiar,
  autoFocus,
}: {
  id: string
  datos: DatosCliente
  cambiar: (c: Partial<DatosCliente>) => void
  autoFocus?: boolean
}) {
  return (
    <>
      <div className="alta">
        <div className="field">
          <label htmlFor={`${id}-nombre`} className="field__label">
            Cliente
          </label>
          <input
            id={`${id}-nombre`}
            className="input"
            value={datos.nombre}
            maxLength={NOMBRE_CLIENTE_MAX}
            placeholder="Ej.: Bar Pepe"
            onChange={(e) => cambiar({ nombre: e.target.value })}
            autoFocus={autoFocus}
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
            value={datos.precio}
            placeholder="0,00"
            onChange={(e) => cambiar({ precio: e.target.value })}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`${id}-notas`} className="field__label">
          Notas <span className="muted">(opcional)</span>
        </label>
        <textarea
          id={`${id}-notas`}
          className="input"
          rows={2}
          maxLength={NOTAS_MAX}
          value={datos.notas}
          onChange={(e) => cambiar({ notas: e.target.value })}
        />
      </div>
    </>
  )
}

function AltaCliente({ ejecutar }: { ejecutar: Ejecutar }) {
  const vacio: DatosCliente = { nombre: '', precio: '', notas: '' }
  const [datos, setDatos] = useState<DatosCliente>(vacio)
  const id = useId()

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (await ejecutar(() => crearCliente(datos))) setDatos(vacio)
  }

  return (
    <form className="card stack" style={{ '--gap': 'var(--sp-3)' } as CSSProperties} onSubmit={(e) => void enviar(e)} aria-labelledby={`${id}-titulo`}>
      <h2 id={`${id}-titulo`} className="t-section">
        Nuevo cliente
      </h2>
      <CamposCliente id={id} datos={datos} cambiar={(c) => setDatos((d) => ({ ...d, ...c }))} />
      <div>
        <button type="submit" className="btn btn--primary">
          Añadir a Contacto
        </button>
      </div>
    </form>
  )
}

function FilaCliente({ cliente: c, ejecutar }: { cliente: Cliente; ejecutar: Ejecutar }) {
  const [modo, setModo] = useState<'ver' | 'editar' | 'borrar'>('ver')
  const [datos, setDatos] = useState<DatosCliente>({ nombre: '', precio: '', notas: '' })
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

  // Cambiar de estado o borrar saca la fila de su lista: el foco pasa a la vecina
  async function sacar(accion: () => Promise<unknown>) {
    const mover = prepararFoco(fila.current)
    if (await ejecutar(accion)) mover()
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    if (await ejecutar(() => editarCliente(c.id, datos))) volver(botonEditar)
  }

  const estado = esEstado(c.estado) ? c.estado : null
  const anterior = estado && estadoVecino(estado, -1)
  const siguiente = estado && estadoVecino(estado, 1)

  if (modo === 'editar') {
    return (
      <li className="list__item">
        <form className="edicion stack" style={{ '--gap': 'var(--sp-3)', paddingBlock: 'var(--sp-2)' } as CSSProperties} onSubmit={(e) => void guardar(e)} aria-label={`Editar: ${c.nombre}`}>
          <CamposCliente id={id} datos={datos} cambiar={(x) => setDatos((d) => ({ ...d, ...x }))} autoFocus />
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
          <span className="break">¿Borrar a «{c.nombre}»?</span>
          <button type="button" className="btn btn--danger" onClick={() => void sacar(() => borrarCliente(c.id))}>
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
    <li className="list__item cliente" ref={fila}>
      <div className="list__main">
        <p className="break" style={{ fontWeight: 'var(--fw-medium)' }}>
          {c.nombre}
        </p>
        <p className="t-small muted">
          {/* «Sin precio» son palabras: van en la fuente de interfaz (regla de la cifra) */}
          {c.precio_centimos ? <span className="num">{formatearEuros(c.precio_centimos)}</span> : 'Sin precio'}
        </p>
        {c.notas && <p className="t-small muted cliente__notas">{c.notas}</p>}
      </div>
      <div className="acciones">
        <button
          type="button"
          className="icon-btn"
          aria-label={anterior ? `Devolver a ${NOMBRE_ESTADO[anterior]}: ${c.nombre}` : `${c.nombre} ya está en el primer estado`}
          disabled={!anterior}
          onClick={() => anterior && void sacar(() => moverCliente(c.id, anterior))}
        >
          <IconoFlecha style={{ transform: 'rotate(180deg)' }} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={siguiente ? `Pasar a ${NOMBRE_ESTADO[siguiente]}: ${c.nombre}` : `${c.nombre} ya está entregado`}
          disabled={!siguiente}
          onClick={() => siguiente && void sacar(() => moverCliente(c.id, siguiente))}
        >
          <IconoFlecha />
        </button>
        <button
          type="button"
          ref={botonEditar}
          className="icon-btn"
          aria-label={`Editar: ${c.nombre}`}
          onClick={() => {
            setDatos({ nombre: c.nombre, precio: c.precio_centimos ? centimosATexto(c.precio_centimos) : '', notas: c.notas })
            setModo('editar')
          }}
        >
          <IconoEditar />
        </button>
        <button type="button" ref={botonBorrar} className="icon-btn icon-btn--peligro" aria-label={`Borrar: ${c.nombre}`} onClick={() => setModo('borrar')}>
          <IconoBorrar />
        </button>
      </div>
    </li>
  )
}
