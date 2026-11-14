// Cumpleaños: lista ordenada por el próximo, con cuenta atrás y la edad que
// cumple (si se sabe el año).

import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type RefObject } from 'react'
import { AvisoError } from '../components/AvisoError'
import { Pagina } from '../components/Pagina'
import { Vacio } from '../components/Vacio'
import { prepararFoco } from '../components/foco'
import { IconoBorrar, IconoCumple, IconoEditar } from '../components/iconos'
import { useAccion } from '../components/useAccion'
import { useHoy } from '../components/useHoy'
import {
  diasMaximos,
  MESES,
  NOMBRE_CUMPLE_MAX,
  NOTAS_CUMPLE_MAX,
  ordenarPorProximo,
  textoCuentaAtras,
  textoDiaMes,
  type ProximoCumple,
} from '../lib/cumpleanos'
import type { FechaDia } from '../lib/fechas'
import { borrarCumple, crearCumple, editarCumple, type Cumple, type DatosCumpleTexto } from '../repos/cumpleanos'
import { useCumpleanos } from '../repos/hooks'
import { useEstadoSync } from '../sync/hooks'

type Ejecutar = (accion: () => Promise<unknown>) => Promise<boolean>

const VACIO: DatosCumpleTexto = { nombre: '', dia: '', mes: '', anio: '', notas: '' }

export function Cumpleanos() {
  const hoy = useHoy()
  const cumples = useCumpleanos()
  const { primeraDescargaHecha } = useEstadoSync()
  const { error, ejecutar, limpiar } = useAccion()
  const lista = cumples.datos ?? []
  const ordenados = ordenarPorProximo(lista, hoy)
  const cargando = cumples.cargando || (lista.length === 0 && !primeraDescargaHecha)

  return (
    <Pagina titulo="Cumpleaños">
      <div className="stack">
        {cumples.error && <AvisoError mensaje="No se han podido leer los cumpleaños de este dispositivo. Recarga la página." />}
        <AvisoError mensaje={error} onCerrar={limpiar} />

        <AltaCumple hoy={hoy} ejecutar={ejecutar} />

        <section aria-labelledby="cumples-lista">
          <h2 id="cumples-lista" className="t-section" tabIndex={-1}>
            Próximos <span className="num muted">{lista.length}</span>
          </h2>
          {cargando && lista.length === 0 ? (
            <div className="stack" role="status" aria-busy="true" style={{ '--gap': 'var(--sp-2)' } as CSSProperties}>
              <span className="visually-hidden">Cargando los cumpleaños…</span>
              <span className="skeleton" style={{ '--h': '3.5rem' } as CSSProperties} />
              <span className="skeleton" style={{ '--h': '3.5rem' } as CSSProperties} />
            </div>
          ) : lista.length === 0 ? (
            <Vacio icono={<IconoCumple />} titulo="Aún no has apuntado cumpleaños">
              Apunta arriba el de tu gente: te los ordeno por el más cercano y te aviso en Inicio la semana de antes.
            </Vacio>
          ) : (
            <ul className="list" role="list">
              {ordenados.map((p) => (
                <FilaCumple key={p.cumple.id} proximo={p} hoy={hoy} ejecutar={ejecutar} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </Pagina>
  )
}

function CamposCumple({ id, datos, cambiar, autoFocus }: { id: string; datos: DatosCumpleTexto; cambiar: (c: Partial<DatosCumpleTexto>) => void; autoFocus?: boolean }) {
  const maximo = datos.mes ? diasMaximos(Number(datos.mes)) : 31
  return (
    <>
      <div className="field">
        <label htmlFor={`${id}-nombre`} className="field__label">
          Persona
        </label>
        <input
          id={`${id}-nombre`}
          className="input"
          value={datos.nombre}
          maxLength={NOMBRE_CUMPLE_MAX}
          placeholder="Ej.: Lucía"
          autoComplete="off"
          autoFocus={autoFocus}
          onChange={(e) => cambiar({ nombre: e.target.value })}
        />
      </div>
      <div className="alta alta--tres">
        <div className="field field--fecha">
          <label htmlFor={`${id}-dia`} className="field__label">
            Día
          </label>
          <select id={`${id}-dia`} className="input" value={datos.dia} onChange={(e) => cambiar({ dia: e.target.value })}>
            <option value="">—</option>
            {Array.from({ length: maximo }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>
                {i + 1}
              </option>
            ))}
          </select>
        </div>
        <div className="field field--fecha">
          <label htmlFor={`${id}-mes`} className="field__label">
            Mes
          </label>
          <select
            id={`${id}-mes`}
            className="input"
            value={datos.mes}
            onChange={(e) => {
              const mes = e.target.value
              // Si el día no existe en el mes nuevo (31 → abril), se baja al último
              const max = mes ? diasMaximos(Number(mes)) : 31
              cambiar({ mes, ...(Number(datos.dia) > max ? { dia: String(max) } : {}) })
            }}
          >
            <option value="">—</option>
            {MESES.map((m, i) => (
              <option key={m} value={String(i + 1)}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="field field--fecha">
          <label htmlFor={`${id}-anio`} className="field__label">
            Año <span className="muted">(opcional)</span>
          </label>
          <input
            id={`${id}-anio`}
            className="input"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            placeholder="Ej.: 2004"
            value={datos.anio}
            aria-describedby={`${id}-anio-ayuda`}
            onChange={(e) => cambiar({ anio: e.target.value })}
          />
        </div>
      </div>
      <p id={`${id}-anio-ayuda`} className="field__hint">
        Con el año, te digo cuántos cumple.
      </p>
      <div className="field">
        <label htmlFor={`${id}-notas`} className="field__label">
          Notas <span className="muted">(opcional)</span>
        </label>
        <textarea
          id={`${id}-notas`}
          className="input"
          rows={2}
          maxLength={NOTAS_CUMPLE_MAX}
          placeholder="Ej.: le gustan los libros de fantasía"
          value={datos.notas}
          onChange={(e) => cambiar({ notas: e.target.value })}
        />
      </div>
    </>
  )
}

function AltaCumple({ hoy, ejecutar }: { hoy: FechaDia; ejecutar: Ejecutar }) {
  const [datos, setDatos] = useState<DatosCumpleTexto>(VACIO)
  const id = useId()

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (await ejecutar(() => crearCumple(datos, hoy))) setDatos(VACIO)
  }

  return (
    <form className="card stack" style={{ '--gap': 'var(--sp-3)' } as CSSProperties} onSubmit={(e) => void enviar(e)} aria-labelledby={`${id}-titulo`}>
      <h2 id={`${id}-titulo`} className="t-section">
        Nuevo cumpleaños
      </h2>
      <CamposCumple id={id} datos={datos} cambiar={(c) => setDatos((d) => ({ ...d, ...c }))} />
      <div>
        <button type="submit" className="btn btn--primary">
          Añadir
        </button>
      </div>
    </form>
  )
}

function FilaCumple({ proximo: p, hoy, ejecutar }: { proximo: ProximoCumple<Cumple>; hoy: FechaDia; ejecutar: Ejecutar }) {
  const c = p.cumple
  const [modo, setModo] = useState<'ver' | 'editar' | 'borrar'>('ver')
  const [datos, setDatos] = useState<DatosCumpleTexto>(VACIO)
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
    // Cambiar la fecha puede moverlo de sitio en la lista: el foco va al título
    if (await ejecutar(() => editarCumple(c.id, datos, hoy))) {
      setModo('ver')
      requestAnimationFrame(() => document.getElementById('cumples-lista')?.focus())
    }
  }

  async function borrar() {
    const mover = prepararFoco(fila.current)
    if (await ejecutar(() => borrarCumple(c.id))) mover()
  }

  if (modo === 'editar') {
    return (
      <li className="list__item">
        <form className="edicion stack" style={{ '--gap': 'var(--sp-3)', paddingBlock: 'var(--sp-2)' } as CSSProperties} onSubmit={(e) => void guardar(e)} aria-label={`Editar: ${c.nombre}`}>
          <CamposCumple id={id} datos={datos} cambiar={(x) => setDatos((d) => ({ ...d, ...x }))} autoFocus />
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
          <span className="break">¿Borrar el cumpleaños de «{c.nombre}»?</span>
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

  const cuenta = textoCuentaAtras(p.dias)
  return (
    <li className="list__item cumple" ref={fila}>
      <span className={`cumple__cuenta${p.dias === 0 ? ' cumple__cuenta--hoy' : ''}`}>{cuenta.replace(/^./, (x) => x.toLocaleUpperCase('es-ES'))}</span>
      <div className="list__main">
        <p className="break" style={{ fontWeight: 'var(--fw-medium)' }}>
          {c.nombre}
        </p>
        <p className="t-small muted">
          {textoDiaMes(c.dia, c.mes)}
          {p.edad !== null && (
            <>
              {' · '}
              {p.dias === 0 ? 'cumple' : 'cumplirá'} <span className="num">{p.edad}</span>
            </>
          )}
        </p>
        {c.notas && <p className="t-small muted cliente__notas">{c.notas}</p>}
      </div>
      <div className="acciones">
        <button
          type="button"
          ref={botonEditar}
          className="icon-btn"
          aria-label={`Editar: ${c.nombre}`}
          onClick={() => {
            setDatos({ nombre: c.nombre, dia: String(c.dia), mes: String(c.mes), anio: c.anio ? String(c.anio) : '', notas: c.notas })
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
