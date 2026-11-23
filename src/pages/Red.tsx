// Vigilante de la red de casa: los aparatos que ha visto el agente del PC,
// los desconocidos arriba y destacados (con texto, no solo color).

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { useSesion } from '../auth/useSesion'
import { AvisoError } from '../components/AvisoError'
import { Pagina } from '../components/Pagina'
import { Vacio } from '../components/Vacio'
import { IconoAviso, IconoRed } from '../components/iconos'
import { useAccion } from '../components/useAccion'
import { useEnLinea } from '../components/useEnLinea'
import { cuandoSeEnvio } from '../lib/puente'
import { agrupar, minutosConectado, nombreAparato, type Aparato, type Grupo, type Intervalo } from '../lib/red'
import { borrarAparato, escucharRed, historial, listarAparatos, marcarConocido, renombrarAparato, unirAparato } from '../repos/red'

/**
 * Adónde va el foco cuando la lista se recarga: al marcar conocido/desconocido
 * la fila cambia de bloque (se monta de nuevo), al unir desaparece, etc.
 * Sin `foco`, va al h1 (la fila ya no existe).
 */
type Foco = { id: string; a: 'conocido' | 'nombre' | 'titulo' }
type Despues = { aviso: string; foco?: Foco }
type Ejecutar = (accion: () => Promise<unknown>, despues?: Despues) => Promise<boolean>

export function Red() {
  const { usuario } = useSesion()
  const enLinea = useEnLinea()
  const { error, ejecutar, limpiar } = useAccion()
  const [aparatos, setAparatos] = useState<Aparato[] | null>(null)
  const [errorLectura, setErrorLectura] = useState<string | null>(null)
  const [ahora, setAhora] = useState(() => Date.now())
  const [foco, setFoco] = useState<Foco | null>(null)
  const [aviso, setAviso] = useState('')
  const limpiarFoco = useCallback(() => setFoco(null), [])

  const cargar = useCallback(
    () =>
      listarAparatos().then(
        (l) => {
          setAhora(Date.now())
          setAparatos(l)
          setErrorLectura(null)
        },
        (e: unknown) => setErrorLectura(e instanceof Error ? e.message : 'No se ha podido leer tu red.'),
      ),
    [],
  )
  useEffect(() => {
    if (!enLinea || !usuario) return
    void cargar()
    return escucharRed(usuario.id, () => void cargar())
  }, [enLinea, usuario, cargar])

  const grupos = aparatos ? agrupar(aparatos) : []
  const desconocidos = grupos.filter((g) => !g.principal.conocido)
  const conocidos = grupos.filter((g) => g.principal.conocido)
  const conectados = grupos.filter((g) => g.conectado).length
  const ejecutarYRecargar: Ejecutar = (accion, despues) =>
    ejecutar(accion).then(async (ok) => {
      if (!ok) return ok
      await cargar()
      if (despues) {
        setAviso(despues.aviso)
        if (despues.foco) setFoco(despues.foco)
        else document.querySelector<HTMLElement>('main h1')?.focus()
      }
      return ok
    })

  return (
    <Pagina titulo="Red de casa" subtitulo={aparatos ? `${conectados} ${conectados === 1 ? 'conectado' : 'conectados'} ahora` : undefined}>
      <div className="stack">
        <span className="visually-hidden" role="status">
          {aviso}
        </span>
        <AvisoError mensaje={error} onCerrar={limpiar} />
        {!enLinea && <AvisoError mensaje="Sin conexión: la red de casa necesita internet." />}
        {errorLectura && enLinea && <AvisoError mensaje={errorLectura} />}

        <p className="t-small muted">
          El agente de tu PC mira cada 5 minutos qué hay en tu red, solo cuando está en casa. Ojo: los móviles suelen usar una{' '}
          <strong>MAC privada (aleatoria)</strong> que cambia de vez en cuando, así que un móvil conocido puede salir como nuevo: si es el mismo,
          únelo con «Es el mismo que…».
        </p>

        {aparatos === null && enLinea && !errorLectura ? (
          <div role="status" aria-busy="true">
            <span className="visually-hidden">Cargando tu red…</span>
            <span className="skeleton" style={{ '--h': '5rem' } as CSSProperties} />
          </div>
        ) : aparatos && aparatos.length === 0 ? (
          <Vacio icono={<IconoRed />} titulo="Aún no se ha visto nada">
            Configura en el agente la MAC de tu router (mipanel-agente red) y espera unos minutos estando en casa.
          </Vacio>
        ) : (
          <>
            {desconocidos.length > 0 && (
              <section aria-labelledby="red-desconocidos" className="stack" style={{ '--gap': 'var(--sp-2)' } as CSSProperties}>
                <h2 id="red-desconocidos" className="t-section red__titulo-aviso">
                  <IconoAviso /> Desconocidos <span className="num muted">{desconocidos.length}</span>
                </h2>
                <ul className="list" role="list">
                  {desconocidos.map((g) => (
                    <FilaAparato
                      key={g.principal.id}
                      grupo={g}
                      conocidos={conocidos}
                      ahora={ahora}
                      ejecutar={ejecutarYRecargar}
                      foco={foco}
                      limpiarFoco={limpiarFoco}
                    />
                  ))}
                </ul>
              </section>
            )}
            {conocidos.length > 0 && (
              <section aria-labelledby="red-conocidos" className="stack" style={{ '--gap': 'var(--sp-2)' } as CSSProperties}>
                <h2 id="red-conocidos" className="t-section">
                  Conocidos <span className="num muted">{conocidos.length}</span>
                </h2>
                <ul className="list" role="list">
                  {conocidos.map((g) => (
                    <FilaAparato
                      key={g.principal.id}
                      grupo={g}
                      conocidos={conocidos}
                      ahora={ahora}
                      ejecutar={ejecutarYRecargar}
                      foco={foco}
                      limpiarFoco={limpiarFoco}
                    />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </Pagina>
  )
}

type Modo = 'ver' | 'nombre' | 'unir' | 'borrar' | 'historial'

function FilaAparato({
  grupo,
  conocidos,
  ahora,
  ejecutar,
  foco,
  limpiarFoco,
}: {
  grupo: Grupo<Aparato>
  conocidos: Grupo<Aparato>[]
  ahora: number
  ejecutar: Ejecutar
  foco: Foco | null
  limpiarFoco: () => void
}) {
  const a = grupo.principal
  const id = useId()
  const [modo, setModo] = useState<Modo>('ver')
  const [nombre, setNombre] = useState(a.nombre ?? '')
  const [con, setCon] = useState('')
  const [intervalos, setIntervalos] = useState<Intervalo[] | null>(null)
  const otrosConocidos = conocidos.filter((g) => g.principal.id !== a.id)
  const visible = nombreAparato(a)

  const titulo = useRef<HTMLHeadingElement>(null)
  const botonConocido = useRef<HTMLButtonElement>(null)
  const botonNombre = useRef<HTMLButtonElement>(null)
  const botonUnir = useRef<HTMLButtonElement>(null)
  const botonOlvidar = useRef<HTMLButtonElement>(null)
  // Al cancelar, el foco vuelve al botón que abrió el formulario o la confirmación
  const volverA = useRef<HTMLButtonElement | null>(null)
  const volver = (boton: { current: HTMLButtonElement | null }) => {
    volverA.current = boton.current
    setModo('ver')
  }
  useEffect(() => {
    if (modo !== 'ver' || !volverA.current) return
    volverA.current.focus()
    volverA.current = null
  }, [modo])
  // Escape cierra y vuelve al botón que lo abrió (el ref se lee al pulsar, no al pintar)
  const conEscape = (cual: 'nombre' | 'unir' | 'olvidar') => (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    volver(cual === 'nombre' ? botonNombre : cual === 'unir' ? botonUnir : botonOlvidar)
  }

  // Tras recargar la lista, el foco que pidió la página
  useEffect(() => {
    if (!foco || foco.id !== a.id) return
    const destino = foco.a === 'conocido' ? botonConocido.current : foco.a === 'nombre' ? botonNombre.current : titulo.current
    destino?.focus()
    limpiarFoco()
  }, [foco, a.id, limpiarFoco])

  return (
    <li className={`list__item red-aparato${a.conocido ? '' : ' red-aparato--desconocido'}`}>
      <div className="list__main stack" style={{ '--gap': 'var(--sp-1)' } as CSSProperties}>
        {/* h3: se puede saltar de aparato en aparato con el lector de pantalla */}
        <h3 id={`${id}-titulo`} ref={titulo} tabIndex={-1} className="red-aparato__nombre">
          <span className="red-aparato__texto break">{visible}</span>
          {!a.conocido && <span className="tag tag--warn red-aparato__tag">Desconocido</span>}
          <span className={`tag ${grupo.conectado ? 'tag--ok' : ''} red-aparato__tag`}>{grupo.conectado ? 'Conectado' : 'No conectado'}</span>
        </h3>
        <p className="t-small muted break">
          {/* Lo que no sale ya como nombre: cómo se anuncia y quién fabricó su chip de red */}
          {a.nombre_red && a.nombre_red !== nombreAparato(a) ? `Se anuncia como «${a.nombre_red}» · ` : ''}
          {a.fabricante && a.fabricante !== nombreAparato(a) ? `${a.fabricante} · ` : ''}
          {a.aleatoria ? 'MAC privada · ' : ''}
          {grupo.ip ? <span className="num">{grupo.ip} · </span> : null}
          <span className="num">{a.mac}</span>
        </p>
        <p className="t-small muted">
          Visto por primera vez {cuandoSeEnvio(a.primera_vez, ahora)} · última {cuandoSeEnvio(grupo.ultima_vez, ahora)}
          {grupo.unidos.length > 0 && ` · ${grupo.unidos.length === 1 ? '1 MAC más unida' : `${grupo.unidos.length} MAC más unidas`}`}
        </p>

        {modo === 'nombre' && (
          <form
            className="row red-aparato__form"
            onKeyDown={conEscape('nombre')}
            onSubmit={(e) => {
              e.preventDefault()
              void ejecutar(
                async () => {
                  await renombrarAparato(a.id, nombre)
                  setModo('ver')
                },
                { aviso: 'Nombre guardado', foco: { id: a.id, a: 'nombre' } },
              )
            }}
          >
            <label htmlFor={`${id}-nombre`} className="visually-hidden">
              Nombre del aparato
            </label>
            <input id={`${id}-nombre`} className="input" value={nombre} maxLength={40} placeholder="Ej.: Tele del salón" autoFocus onChange={(e) => setNombre(e.target.value)} />
            <button type="submit" className="btn btn--primary">
              Guardar
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => volver(botonNombre)}>
              Cancelar
            </button>
          </form>
        )}

        {modo === 'unir' && (
          <form
            className="row red-aparato__form"
            onKeyDown={conEscape('unir')}
            onSubmit={(e) => {
              e.preventDefault()
              if (!con) return
              const destino = otrosConocidos.find((g) => g.principal.id === con)
              void ejecutar(
                async () => {
                  await unirAparato(a.id, con)
                  setModo('ver')
                },
                // Esta fila desaparece: el foco va al aparato con el que se ha unido
                { aviso: `Unido a «${destino ? nombreAparato(destino.principal) : 'el aparato conocido'}»`, foco: { id: con, a: 'titulo' } },
              )
            }}
          >
            <label htmlFor={`${id}-unir`} className="visually-hidden">
              Es el mismo aparato que
            </label>
            <select id={`${id}-unir`} className="input" value={con} autoFocus onChange={(e) => setCon(e.target.value)}>
              <option value="">Elige el aparato conocido…</option>
              {otrosConocidos.map((g) => (
                <option key={g.principal.id} value={g.principal.id}>
                  {nombreAparato(g.principal)}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn--primary" disabled={!con}>
              Unir
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => volver(botonUnir)}>
              Cancelar
            </button>
          </form>
        )}

        {modo === 'borrar' && (
          <div className="confirmar" role="group" aria-labelledby={`${id}-borrar`} onKeyDown={conEscape('olvidar')}>
            <span id={`${id}-borrar`} className="break">
              ¿Olvidar «{visible}»? Si vuelve a aparecer, saldrá como nuevo y te avisará.
            </span>
            {/* La fila desaparece: el foco va al h1 y se anuncia */}
            <button type="button" className="btn btn--danger" onClick={() => void ejecutar(() => borrarAparato(a.id), { aviso: `«${visible}» olvidado` })}>
              Olvidar
            </button>
            <button type="button" className="btn btn--ghost" autoFocus onClick={() => volver(botonOlvidar)}>
              Cancelar
            </button>
          </div>
        )}

        {modo === 'historial' && (
          <div className="red-historial" id={`${id}-historial`}>
            {intervalos === null ? (
              <p className="t-small muted" role="status">
                Cargando…
              </p>
            ) : intervalos.length === 0 ? (
              <p className="t-small muted">Sin historial en los últimos 30 días.</p>
            ) : (
              <>
                <p className="t-small">
                  Conectado unas <span className="num">{Math.round(minutosConectado(intervalos) / 6) / 10}</span> horas en los últimos 30 días.
                </p>
                <ul className="red-historial__lista" role="list">
                  {intervalos.slice(0, 15).map((i) => (
                    <li key={`${i.desde}-${i.hasta}`} className="t-small num">
                      {cuandoSeEnvio(i.desde, ahora)} <span aria-hidden="true">→</span>
                      <span className="visually-hidden">hasta</span> {cuandoSeEnvio(i.hasta, ahora)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {modo === 'ver' || modo === 'historial' ? (
          // Cada botón se describe con el nombre del aparato («Olvidar, Tele del salón»)
          <div className="row red-aparato__acciones">
            <button
              ref={botonConocido}
              type="button"
              className="btn btn--secondary btn--sm"
              aria-describedby={`${id}-titulo`}
              onClick={() =>
                void ejecutar(() => marcarConocido(a.id, !a.conocido), {
                  aviso: `«${visible}» ${a.conocido ? 'ahora es desconocido' : 'ahora es conocido'}`,
                  foco: { id: a.id, a: 'conocido' },
                })
              }
            >
              {a.conocido ? 'Marcar como desconocido' : 'Es conocido'}
            </button>
            <button ref={botonNombre} type="button" className="btn btn--ghost btn--sm" aria-describedby={`${id}-titulo`} onClick={() => setModo('nombre')}>
              Ponerle nombre
            </button>
            {!a.conocido && otrosConocidos.length > 0 && (
              <button ref={botonUnir} type="button" className="btn btn--ghost btn--sm" aria-describedby={`${id}-titulo`} onClick={() => setModo('unir')}>
                Es el mismo que…
              </button>
            )}
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              aria-describedby={`${id}-titulo`}
              aria-expanded={modo === 'historial'}
              aria-controls={modo === 'historial' ? `${id}-historial` : undefined}
              onClick={() => {
                if (modo === 'historial') return setModo('ver')
                setModo('historial')
                setIntervalos(null)
                historial([a.id, ...grupo.unidos.map((u) => u.id)]).then(setIntervalos, () => setIntervalos([]))
              }}
            >
              {modo === 'historial' ? 'Ocultar historial' : 'Historial'}
            </button>
            <button ref={botonOlvidar} type="button" className="btn btn--ghost btn--sm btn--danger-text" aria-describedby={`${id}-titulo`} onClick={() => setModo('borrar')}>
              Olvidar
            </button>
          </div>
        ) : null}
      </div>
    </li>
  )
}
