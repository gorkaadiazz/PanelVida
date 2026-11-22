// Hogar de la Lista de casa: crearlo o entrar con un código (si no estás en
// ninguno) y, si estás, ver los miembros, invitar, expulsar y salir.

import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { formatearCodigo, mensajeUnirse, ordenarMiembros, pareceCodigo, textoCaducaInvitacion } from '../lib/hogar'
import {
  anularInvitacion,
  borrarHogar,
  crearHogar,
  crearInvitacion,
  expulsar,
  listarInvitaciones,
  salirDelHogar,
  unirseConCodigo,
  type Hogar,
  type Invitacion,
} from '../repos/hogar'
import { useEnLinea } from './useEnLinea'
import { IconoBorrar, IconoCopiar, IconoCasa } from './iconos'

type Ejecutar = (accion: () => Promise<unknown>) => Promise<boolean>

/** Sin hogar: crear uno (solo cuentas normales) o entrar con un código. */
export function SinHogar({ puedeCrear, ejecutar }: { puedeCrear: boolean; ejecutar: Ejecutar }) {
  const id = useId()
  const enLinea = useEnLinea()
  const [codigo, setCodigo] = useState('')
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [nombre, setNombre] = useState('Casa')

  async function unirse(e: FormEvent) {
    e.preventDefault()
    setMensaje(null)
    await ejecutar(async () => {
      const r = await unirseConCodigo(codigo)
      setMensaje(mensajeUnirse(r))
      if (r === 'ok') setCodigo('')
    })
  }

  return (
    <div className="stack">
      <div className="card stack" style={{ '--gap': 'var(--sp-3)' } as CSSProperties}>
        <h2 className="t-section">Entrar en un hogar</h2>
        <p className="muted">Pide un código de invitación a quien creó el hogar y escríbelo aquí. Sirve una sola vez y dura 7 días.</p>
        <form className="stack" onSubmit={(e) => void unirse(e)} style={{ '--gap': 'var(--sp-3)' } as CSSProperties}>
          <div className="field">
            <label htmlFor={`${id}-codigo`} className="field__label">
              Código de invitación
            </label>
            <input
              id={`${id}-codigo`}
              className="input hogar-codigo"
              value={codigo}
              placeholder="ABCDE-FGHJK"
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              enterKeyHint="go"
              maxLength={11}
              aria-invalid={mensaje ? true : undefined}
              aria-describedby={mensaje ? `${id}-mensaje` : undefined}
              onChange={(e) => setCodigo(formatearCodigo(e.target.value))}
            />
            {mensaje && (
              <p id={`${id}-mensaje`} className="field__error" role="alert">
                {mensaje}
              </p>
            )}
          </div>
          <button type="submit" className="btn btn--primary" disabled={!pareceCodigo(codigo) || !enLinea}>
            Entrar
          </button>
          {!enLinea && <p className="t-small muted">Para entrar en un hogar hace falta conexión.</p>}
        </form>
      </div>

      {puedeCrear && (
        <form
          className="card stack"
          style={{ '--gap': 'var(--sp-3)' } as CSSProperties}
          onSubmit={(e) => {
            e.preventDefault()
            void ejecutar(() => crearHogar(nombre))
          }}
        >
          <h2 className="t-section">O crea el tuyo</h2>
          <p className="muted">Después podrás invitar a tu familia con un código. Ellos solo verán la lista de la compra.</p>
          <div className="field">
            <label htmlFor={`${id}-nombre`} className="field__label">
              Nombre del hogar
            </label>
            <input id={`${id}-nombre`} className="input" value={nombre} maxLength={60} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <button type="submit" className="btn btn--secondary" disabled={!enLinea}>
            Crear hogar
          </button>
        </form>
      )}
    </div>
  )
}

/** Panel del hogar: miembros, invitaciones y salir. */
export function PanelHogar({ hogar, yo, ejecutar }: { hogar: Hogar; yo: string; ejecutar: Ejecutar }) {
  const soyDueno = hogar.duenoId === yo
  const enLinea = useEnLinea()
  const [confirmarSalida, setConfirmarSalida] = useState(false)
  const botonSalir = useRef<HTMLButtonElement>(null)
  const miembros = ordenarMiembros(hogar.miembros, hogar.duenoId)

  return (
    <details className="card hogar-panel">
      <summary>
        <span className="hogar-panel__titulo">
          <IconoCasa />
          <span className="t-section">{hogar.nombre}</span>
          <span className="muted num">
            {miembros.length === 1 ? '1 persona' : `${miembros.length} personas`}
          </span>
        </span>
      </summary>
      <div className="stack" style={{ '--gap': 'var(--sp-4)', marginTop: 'var(--sp-3)' } as CSSProperties}>
        <section aria-label="Miembros">
          <ul className="list" role="list">
            {miembros.map((m) => (
              <FilaMiembro key={m.user_id} hogar={hogar} miembro={m} yo={yo} puedeExpulsar={soyDueno && m.user_id !== yo && enLinea} ejecutar={ejecutar} />
            ))}
          </ul>
        </section>

        {soyDueno && <Invitar ejecutar={ejecutar} />}

        <div role="group" aria-label={soyDueno ? 'Borrar el hogar' : 'Salir del hogar'}>
          {confirmarSalida ? (
            <div className="confirmar">
              <span className="break">
                {soyDueno
                  ? '¿Borrar el hogar? Todos dejarán de verlo y se borrará la Lista de casa.'
                  : '¿Salir del hogar? Dejarás de ver la Lista de casa.'}
              </span>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() =>
                  // El panel desaparece (pasa a «Entrar en un hogar»): el foco, al h1
                  void ejecutar(() => (soyDueno ? borrarHogar(hogar.id) : salirDelHogar(hogar.id))).then((ok) => {
                    if (ok) requestAnimationFrame(() => document.querySelector<HTMLElement>('main h1')?.focus())
                  })
                }
              >
                {soyDueno ? 'Borrar' : 'Salir'}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                autoFocus
                onClick={() => {
                  setConfirmarSalida(false)
                  requestAnimationFrame(() => botonSalir.current?.focus())
                }}
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button type="button" ref={botonSalir} className="btn btn--ghost btn--sm btn--danger-text" disabled={!enLinea} onClick={() => setConfirmarSalida(true)}>
              {soyDueno ? 'Borrar el hogar' : 'Salir del hogar'}
            </button>
          )}
        </div>
      </div>
    </details>
  )
}

function FilaMiembro({
  hogar,
  miembro: m,
  yo,
  puedeExpulsar,
  ejecutar,
}: {
  hogar: Hogar
  miembro: { user_id: string; nombre: string }
  yo: string
  puedeExpulsar: boolean
  ejecutar: Ejecutar
}) {
  const [confirmando, setConfirmando] = useState(false)
  const fila = useRef<HTMLLIElement>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const etiqueta = m.user_id === hogar.duenoId ? 'Creó el hogar' : null
  if (confirmando) {
    return (
      <li className="list__item" ref={fila}>
        <div className="confirmar list__main" role="group" aria-label={`Expulsar a ${m.nombre}`}>
          <span className="break">¿Expulsar a {m.nombre}? Dejará de ver la Lista de casa ahora mismo.</span>
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => {
              // La fila desaparece: el foco, al botón de la fila vecina o al resumen del hogar
              const vecina = fila.current?.nextElementSibling ?? fila.current?.previousElementSibling
              const destino =
                vecina?.querySelector<HTMLElement>('button:not(:disabled)') ??
                fila.current?.closest('details')?.querySelector<HTMLElement>('summary') ??
                null
              void ejecutar(() => expulsar(hogar.id, m.user_id)).then((ok) => {
                if (ok && destino?.isConnected) destino.focus()
              })
            }}
          >
            Expulsar
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
      </li>
    )
  }
  return (
    <li className="list__item">
      <div className="list__main">
        <p className="break">
          {m.nombre}
          {m.user_id === yo && <span className="muted"> (tú)</span>}
        </p>
        {etiqueta && <p className="t-small muted">{etiqueta}</p>}
      </div>
      {puedeExpulsar && (
        <button type="button" ref={boton} className="btn btn--ghost btn--sm btn--danger-text" aria-label={`Expulsar a ${m.nombre}`} onClick={() => setConfirmando(true)}>
          Expulsar
        </button>
      )}
    </li>
  )
}

function Invitar({ ejecutar }: { ejecutar: Ejecutar }) {
  const enLinea = useEnLinea()
  const [nueva, setNueva] = useState<{ codigo: string; caduca_en: string } | null>(null)
  const [activas, setActivas] = useState<Invitacion[]>([])
  const [copiado, setCopiado] = useState(false)
  const [ahora] = useState(() => Date.now())
  const codigoRef = useRef<HTMLParagraphElement>(null)
  const crearRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!enLinea) return
    listarInvitaciones().then(setActivas, () => {})
  }, [enLinea, nueva])

  return (
    <section className="stack" aria-label="Invitar" style={{ '--gap': 'var(--sp-3)' } as CSSProperties}>
      <h2 className="t-label">Invitar</h2>
      {nueva ? (
        <div className="hogar-invitacion">
          <p className="t-small muted">Dale este código a quien quieras invitar. Solo se ve ahora: apúntalo o cópialo.</p>
          <p ref={codigoRef} className="hogar-invitacion__codigo num" tabIndex={-1}>
            {nueva.codigo}
          </p>
          <p className="t-small muted">{textoCaducaInvitacion(nueva.caduca_en, ahora)} · Sirve una sola vez.</p>
          <div className="row">
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() =>
                void ejecutar(async () => {
                  await navigator.clipboard.writeText(nueva.codigo)
                  setCopiado(true)
                  setTimeout(() => setCopiado(false), 2000)
                })
              }
            >
              <IconoCopiar /> {copiado ? 'Copiado' : 'Copiar'}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setNueva(null)
                requestAnimationFrame(() => crearRef.current?.focus())
              }}
            >
              Hecho
            </button>
          </div>
          <span className="visually-hidden" role="status">
            {copiado ? 'Código copiado' : ''}
          </span>
        </div>
      ) : (
        <button
          type="button"
          ref={crearRef}
          className="btn btn--secondary"
          disabled={!enLinea}
          onClick={() =>
            void ejecutar(async () => {
              setNueva(await crearInvitacion())
              requestAnimationFrame(() => codigoRef.current?.focus())
            })
          }
        >
          Crear un código de invitación
        </button>
      )}
      {activas.length > 0 && (
        <ul className="list" role="list" aria-label="Códigos sin usar">
          {activas.map((i) => (
            <li key={i.id} className="list__item">
              <span className="list__main t-small">
                Código sin usar · {textoCaducaInvitacion(i.caduca_en, ahora)}
              </span>
              <button
                type="button"
                className="icon-btn icon-btn--peligro"
                aria-label={`Anular el código sin usar (${textoCaducaInvitacion(i.caduca_en, ahora).toLowerCase()})`}
                onClick={(e) => {
                  // La fila desaparece: el foco, al botón de la vecina o al primero de «Invitar»
                  const fila = e.currentTarget.closest('li')
                  const seccion = e.currentTarget.closest('section')
                  const vecina = (fila?.nextElementSibling ?? fila?.previousElementSibling)?.querySelector<HTMLElement>('button') ?? null
                  void ejecutar(async () => {
                    await anularInvitacion(i.id)
                    setActivas((lista) => lista.filter((x) => x.id !== i.id))
                  }).then((ok) => {
                    if (!ok) return
                    requestAnimationFrame(() => {
                      if (vecina?.isConnected) vecina.focus()
                      else seccion?.querySelector<HTMLElement>('button:not(:disabled)')?.focus()
                    })
                  })
                }}
              >
                <IconoBorrar />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
