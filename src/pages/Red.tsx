// Vigilante de la red de casa: los aparatos que ha visto el agente del PC,
// los desconocidos arriba y destacados (con texto, no solo color).

import { useCallback, useEffect, useId, useState, type CSSProperties } from 'react'
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

type Ejecutar = (accion: () => Promise<unknown>) => Promise<boolean>

export function Red() {
  const { usuario } = useSesion()
  const enLinea = useEnLinea()
  const { error, ejecutar, limpiar } = useAccion()
  const [aparatos, setAparatos] = useState<Aparato[] | null>(null)
  const [errorLectura, setErrorLectura] = useState<string | null>(null)
  const [ahora, setAhora] = useState(() => Date.now())

  const cargar = useCallback(() => {
    listarAparatos().then(
      (l) => {
        setAhora(Date.now())
        setAparatos(l)
        setErrorLectura(null)
      },
      (e: unknown) => setErrorLectura(e instanceof Error ? e.message : 'No se ha podido leer tu red.'),
    )
  }, [])
  useEffect(() => {
    if (!enLinea || !usuario) return
    cargar()
    return escucharRed(usuario.id, cargar)
  }, [enLinea, usuario, cargar])

  const grupos = aparatos ? agrupar(aparatos) : []
  const desconocidos = grupos.filter((g) => !g.principal.conocido)
  const conocidos = grupos.filter((g) => g.principal.conocido)
  const ejecutarYRecargar: Ejecutar = (accion) => ejecutar(accion).then((ok) => (ok && cargar(), ok))

  return (
    <Pagina titulo="Red de casa" subtitulo={aparatos ? `${grupos.filter((g) => g.conectado).length} conectados ahora` : undefined}>
      <div className="stack">
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
                    <FilaAparato key={g.principal.id} grupo={g} conocidos={conocidos} ahora={ahora} ejecutar={ejecutarYRecargar} />
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
                    <FilaAparato key={g.principal.id} grupo={g} conocidos={conocidos} ahora={ahora} ejecutar={ejecutarYRecargar} />
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

function FilaAparato({ grupo, conocidos, ahora, ejecutar }: { grupo: Grupo<Aparato>; conocidos: Grupo<Aparato>[]; ahora: number; ejecutar: Ejecutar }) {
  const a = grupo.principal
  const id = useId()
  const [modo, setModo] = useState<'ver' | 'nombre' | 'unir' | 'borrar' | 'historial'>('ver')
  const [nombre, setNombre] = useState(a.nombre ?? '')
  const [con, setCon] = useState('')
  const [intervalos, setIntervalos] = useState<Intervalo[] | null>(null)
  const otrosConocidos = conocidos.filter((g) => g.principal.id !== a.id)

  return (
    <li className={`list__item red-aparato${a.conocido ? '' : ' red-aparato--desconocido'}`}>
      <div className="list__main stack" style={{ '--gap': 'var(--sp-1)' } as CSSProperties}>
        <p className="red-aparato__nombre break">
          {nombreAparato(a)}
          {!a.conocido && <span className="tag tag--warn red-aparato__tag">Desconocido</span>}
          <span className={`tag ${grupo.conectado ? 'tag--ok' : ''} red-aparato__tag`}>{grupo.conectado ? 'Conectado' : 'No conectado'}</span>
        </p>
        <p className="t-small muted break">
          {a.fabricante && a.nombre ? `${a.fabricante} · ` : ''}
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
            onSubmit={(e) => {
              e.preventDefault()
              void ejecutar(async () => {
                await renombrarAparato(a.id, nombre)
                setModo('ver')
              })
            }}
          >
            <label htmlFor={`${id}-nombre`} className="visually-hidden">
              Nombre del aparato
            </label>
            <input id={`${id}-nombre`} className="input" value={nombre} maxLength={40} placeholder="Ej.: Tele del salón" autoFocus onChange={(e) => setNombre(e.target.value)} />
            <button type="submit" className="btn btn--primary">
              Guardar
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setModo('ver')}>
              Cancelar
            </button>
          </form>
        )}

        {modo === 'unir' && (
          <form
            className="row red-aparato__form"
            onSubmit={(e) => {
              e.preventDefault()
              if (!con) return
              void ejecutar(async () => {
                await unirAparato(a.id, con)
                setModo('ver')
              })
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
            <button type="button" className="btn btn--ghost" onClick={() => setModo('ver')}>
              Cancelar
            </button>
          </form>
        )}

        {modo === 'borrar' && (
          <div className="confirmar" role="group" aria-labelledby={`${id}-borrar`}>
            <span id={`${id}-borrar`} className="break">
              ¿Olvidar «{nombreAparato(a)}»? Si vuelve a aparecer, saldrá como nuevo y te avisará.
            </span>
            <button type="button" className="btn btn--danger" onClick={() => void ejecutar(() => borrarAparato(a.id))}>
              Olvidar
            </button>
            <button type="button" className="btn btn--ghost" autoFocus onClick={() => setModo('ver')}>
              Cancelar
            </button>
          </div>
        )}

        {modo === 'historial' && (
          <div className="red-historial">
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
                      {cuandoSeEnvio(i.desde, ahora)} → {cuandoSeEnvio(i.hasta, ahora)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {modo === 'ver' || modo === 'historial' ? (
          <div className="row red-aparato__acciones">
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => void ejecutar(() => marcarConocido(a.id, !a.conocido))}>
              {a.conocido ? 'Marcar como desconocido' : 'Es conocido'}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setModo('nombre')}>
              Ponerle nombre
            </button>
            {!a.conocido && otrosConocidos.length > 0 && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setModo('unir')}>
                Es el mismo que…
              </button>
            )}
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              aria-expanded={modo === 'historial'}
              onClick={() => {
                if (modo === 'historial') return setModo('ver')
                setModo('historial')
                setIntervalos(null)
                historial([a.id, ...grupo.unidos.map((u) => u.id)]).then(setIntervalos, () => setIntervalos([]))
              }}
            >
              {modo === 'historial' ? 'Ocultar historial' : 'Historial'}
            </button>
            <button type="button" className="btn btn--ghost btn--sm btn--danger-text" onClick={() => setModo('borrar')}>
              Olvidar
            </button>
          </div>
        ) : null}
      </div>
    </li>
  )
}
