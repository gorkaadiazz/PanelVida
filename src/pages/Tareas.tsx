import { useId, useState, type CSSProperties, type FormEvent } from 'react'
import { AvisoError } from '../components/AvisoError'
import { EtiquetaFecha } from '../components/EtiquetaFecha'
import { Pagina } from '../components/Pagina'
import { Vacio } from '../components/Vacio'
import { IconoBorrar, IconoEditar, IconoTareas } from '../components/iconos'
import { useAccion } from '../components/useAccion'
import { useHoy } from '../components/useHoy'
import type { FechaDia } from '../lib/fechas'
import { TEXTO_TAREA_MAX, recuentoTareas } from '../lib/tareas'
import { useTareas } from '../repos/hooks'
import { borrarTarea, crearTarea, editarTarea, marcarTarea, quitarHechas, type Tarea } from '../repos/tareas'
import { useEstadoSync } from '../sync/hooks'

type Ejecutar = (accion: () => Promise<unknown>) => Promise<boolean>

export function Tareas() {
  const dia = useHoy()
  const tareas = useTareas()
  const { primeraDescargaHecha } = useEstadoSync()
  const { error, ejecutar, limpiar } = useAccion()
  const [aviso, setAviso] = useState<string | null>(null)

  const lista = tareas.datos ?? []
  const pendientes = lista.filter((t) => !t.hecha)
  const hechas = lista.filter((t) => t.hecha)
  const cuenta = recuentoTareas(lista, dia)
  const cargando = tareas.cargando || (lista.length === 0 && !primeraDescargaHecha)

  async function quitar() {
    let quitadas = 0
    const bien = await ejecutar(async () => {
      quitadas = await quitarHechas()
    })
    if (bien) {
      setAviso(quitadas === 1 ? 'Se ha quitado 1 tarea hecha.' : `Se han quitado ${quitadas} tareas hechas.`)
    }
  }

  return (
    <Pagina titulo="Tareas" subtitulo={lista.length > 0 ? <Recuento {...cuenta} /> : undefined}>
      <div className="stack">
        {tareas.error && <AvisoError mensaje="No se han podido leer tus tareas de este dispositivo. Recarga la página." />}
        <AvisoError mensaje={error} onCerrar={limpiar} />

        <AltaTarea ejecutar={ejecutar} />

        {cargando && lista.length === 0 ? (
          <div className="stack" role="status" aria-busy="true" style={{ '--gap': 'var(--sp-2)' } as CSSProperties}>
            <span className="visually-hidden">Cargando tus tareas…</span>
            <span className="skeleton" style={{ '--h': '3rem' } as CSSProperties} />
            <span className="skeleton" style={{ '--h': '3rem' } as CSSProperties} />
          </div>
        ) : lista.length === 0 ? (
          <Vacio icono={<IconoTareas />} titulo="No tienes tareas">
            Apunta arriba lo que tengas pendiente; si tiene fecha límite, te avisaré cuando se acerque.
          </Vacio>
        ) : (
          <>
            <section aria-labelledby="tareas-pendientes">
              <h2 id="tareas-pendientes" className="t-section">
                Pendientes <span className="num muted">{pendientes.length}</span>
              </h2>
              {pendientes.length === 0 ? (
                <p className="muted" style={{ paddingBlock: 'var(--sp-3)' }}>
                  Nada pendiente. Bien hecho.
                </p>
              ) : (
                <ListaTareas tareas={pendientes} hoy={dia} ejecutar={ejecutar} />
              )}
            </section>

            {hechas.length > 0 && (
              <section aria-labelledby="tareas-hechas">
                <div className="row row--between">
                  <h2 id="tareas-hechas" className="t-section">
                    Hechas <span className="num muted">{hechas.length}</span>
                  </h2>
                  <button type="button" className="btn btn--ghost btn--danger-text" onClick={() => void quitar()}>
                    Quitar las hechas
                  </button>
                </div>
                <ListaTareas tareas={hechas} hoy={dia} ejecutar={ejecutar} />
              </section>
            )}
          </>
        )}

        <p role="status" className="t-small muted">
          {aviso}
        </p>
      </div>
    </Pagina>
  )
}

function Recuento({ pendientes, atrasadas, proximas }: { pendientes: number; atrasadas: number; proximas: number }) {
  return (
    <>
      <span className="num">{pendientes}</span> {pendientes === 1 ? 'pendiente' : 'pendientes'}
      {atrasadas > 0 && (
        <>
          {' · '}
          <span className="text-danger">
            <span className="num">{atrasadas}</span> {atrasadas === 1 ? 'atrasada' : 'atrasadas'}
          </span>
        </>
      )}
      {proximas > 0 && (
        <>
          {' · '}
          <span className="text-warn">
            <span className="num">{proximas}</span> para hoy o mañana
          </span>
        </>
      )}
    </>
  )
}

function ListaTareas({ tareas, hoy, ejecutar }: { tareas: Tarea[]; hoy: FechaDia; ejecutar: Ejecutar }) {
  return (
    <ul className="list" role="list">
      {tareas.map((t) => (
        <FilaTarea key={t.id} tarea={t} hoy={hoy} ejecutar={ejecutar} />
      ))}
    </ul>
  )
}

function FilaTarea({ tarea, hoy, ejecutar }: { tarea: Tarea; hoy: FechaDia; ejecutar: Ejecutar }) {
  const [editando, setEditando] = useState(false)

  if (editando) {
    return (
      <li className="list__item">
        <EdicionTarea tarea={tarea} ejecutar={ejecutar} onTerminar={() => setEditando(false)} />
      </li>
    )
  }

  return (
    <li className={`list__item${tarea.hecha ? ' tarea--hecha' : ''}`}>
      <button
        type="button"
        className="check"
        aria-pressed={tarea.hecha}
        aria-label={`Hecha: ${tarea.texto}`}
        onClick={() => void ejecutar(() => marcarTarea(tarea.id, !tarea.hecha))}
      />
      <div className="list__main">
        <p className="tarea__texto">{tarea.texto}</p>
        {tarea.fecha_limite && (
          <p className="tarea__meta">
            <EtiquetaFecha tarea={tarea} hoy={hoy} />
          </p>
        )}
      </div>
      <div className="acciones">
        {!tarea.hecha && (
          <button type="button" className="icon-btn" aria-label={`Editar: ${tarea.texto}`} onClick={() => setEditando(true)}>
            <IconoEditar />
          </button>
        )}
        <button
          type="button"
          className="icon-btn icon-btn--peligro"
          aria-label={`Borrar: ${tarea.texto}`}
          onClick={() => void ejecutar(() => borrarTarea(tarea.id))}
        >
          <IconoBorrar />
        </button>
      </div>
    </li>
  )
}

function EdicionTarea({ tarea, ejecutar, onTerminar }: { tarea: Tarea; ejecutar: Ejecutar; onTerminar: () => void }) {
  const [texto, setTexto] = useState(tarea.texto)
  const [fecha, setFecha] = useState(tarea.fecha_limite ?? '')
  const id = useId()

  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    if (await ejecutar(() => editarTarea(tarea.id, { texto, fecha_limite: fecha }))) onTerminar()
  }

  return (
    <form className="edicion alta" onSubmit={(e) => void guardar(e)} aria-label="Editar tarea">
      <div className="field">
        <label htmlFor={`${id}-texto`} className="field__label">
          Tarea
        </label>
        <input
          id={`${id}-texto`}
          className="input"
          value={texto}
          maxLength={TEXTO_TAREA_MAX}
          onChange={(e) => setTexto(e.target.value)}
          autoFocus
        />
      </div>
      <div className="field field--fecha">
        <label htmlFor={`${id}-fecha`} className="field__label">
          Fecha límite
        </label>
        <input id={`${id}-fecha`} type="date" className="input" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </div>
      <div className="row">
        <button type="submit" className="btn btn--primary">
          Guardar
        </button>
        <button type="button" className="btn btn--ghost" onClick={onTerminar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function AltaTarea({ ejecutar }: { ejecutar: Ejecutar }) {
  const [texto, setTexto] = useState('')
  const [fecha, setFecha] = useState('')
  const id = useId()

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (await ejecutar(() => crearTarea({ texto, fecha_limite: fecha }))) {
      setTexto('')
      setFecha('')
    }
  }

  return (
    <form className="alta" onSubmit={(e) => void enviar(e)} aria-label="Nueva tarea">
      <div className="field">
        <label htmlFor={`${id}-texto`} className="field__label">
          Nueva tarea
        </label>
        <input
          id={`${id}-texto`}
          className="input"
          value={texto}
          maxLength={TEXTO_TAREA_MAX}
          placeholder="Ej.: Entregar la práctica de SOR"
          onChange={(e) => setTexto(e.target.value)}
        />
      </div>
      <div className="field field--fecha">
        <label htmlFor={`${id}-fecha`} className="field__label">
          Fecha límite <span className="muted">(opcional)</span>
        </label>
        <input id={`${id}-fecha`} type="date" className="input" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </div>
      <button type="submit" className="btn btn--primary">
        Añadir
      </button>
    </form>
  )
}
