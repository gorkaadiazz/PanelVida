// Bandeja de ideas: lo apuntado con el botón «+». Cada idea se convierte en
// tarea, plan o deseo (rellenando el resto en su pantalla), se archiva o se borra.

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import { AvisoError } from '../components/AvisoError'
import { MenuDesplegable } from '../components/MenuDesplegable'
import { Pagina } from '../components/Pagina'
import { Vacio } from '../components/Vacio'
import { prepararFoco } from '../components/foco'
import { IconoArchivar, IconoBorrar, IconoIdea } from '../components/iconos'
import { useAccion } from '../components/useAccion'
import { diaEnMadrid, formatearFecha } from '../lib/fechas'
import { DESTINOS_IDEA, ideasArchivadas, ideasSinProcesar } from '../lib/ideas'
import { useIdeas } from '../repos/hooks'
import { archivarIdea, borrarIdea, type Idea } from '../repos/ideas'
import { useEstadoSync } from '../sync/hooks'

type Ejecutar = (accion: () => Promise<unknown>) => Promise<boolean>

function fechaDe(idea: Idea): string {
  try {
    return formatearFecha(diaEnMadrid(idea.created_at))
  } catch {
    return ''
  }
}

export function Ideas() {
  const ideas = useIdeas()
  const { primeraDescargaHecha } = useEstadoSync()
  const { error, ejecutar, limpiar } = useAccion()
  const lista = ideas.datos ?? []
  const pendientes = ideasSinProcesar(lista)
  const archivadas = ideasArchivadas(lista)
  const cargando = ideas.cargando || (lista.length === 0 && !primeraDescargaHecha)

  return (
    <Pagina titulo="Ideas" subtitulo={pendientes.length ? `${pendientes.length} sin procesar` : undefined}>
      <div className="stack">
        {ideas.error && <AvisoError mensaje="No se han podido leer tus ideas de este dispositivo. Recarga la página." />}
        <AvisoError mensaje={error} onCerrar={limpiar} />

        {cargando && lista.length === 0 ? (
          <div className="stack" role="status" aria-busy="true" style={{ '--gap': 'var(--sp-2)' } as CSSProperties}>
            <span className="visually-hidden">Cargando tus ideas…</span>
            <span className="skeleton" style={{ '--h': '3.5rem' } as CSSProperties} />
            <span className="skeleton" style={{ '--h': '3.5rem' } as CSSProperties} />
          </div>
        ) : (
          <section aria-labelledby="ideas-pendientes">
            <h2 id="ideas-pendientes" className="t-section" tabIndex={-1}>
              Sin procesar <span className="num muted">{pendientes.length}</span>
            </h2>
            {pendientes.length === 0 ? (
              <Vacio icono={<IconoIdea />} titulo={lista.length ? 'Bandeja vacía' : 'Aún no has apuntado ideas'}>
                Pulsa el botón «+» de abajo en cualquier pantalla para apuntar algo al vuelo. Luego, aquí decides si es una tarea, un plan o
                algo que quieres comprar.
              </Vacio>
            ) : (
              <ul className="list" role="list">
                {pendientes.map((i) => (
                  <FilaIdea key={i.id} idea={i} ejecutar={ejecutar} />
                ))}
              </ul>
            )}
          </section>
        )}

        {archivadas.length > 0 && (
          <details className="card fijos">
            <summary>
              <span className="t-section">
                Archivadas <span className="num muted">{archivadas.length}</span>
              </span>
            </summary>
            <ul className="list" role="list" style={{ marginTop: 'var(--sp-2)' }}>
              {archivadas.map((i) => (
                <FilaIdea key={i.id} idea={i} ejecutar={ejecutar} />
              ))}
            </ul>
          </details>
        )}
      </div>
    </Pagina>
  )
}

function FilaIdea({ idea: i, ejecutar }: { idea: Idea; ejecutar: Ejecutar }) {
  const [borrando, setBorrando] = useState(false)
  const fila = useRef<HTMLLIElement>(null)
  const botonBorrar = useRef<HTMLButtonElement>(null)
  const volverA = useRef<RefObject<HTMLButtonElement | null> | null>(null)
  useEffect(() => {
    if (borrando || !volverA.current) return
    volverA.current.current?.focus()
    volverA.current = null
  }, [borrando])

  // Archivar, recuperar o borrar la saca de su lista: el foco pasa a la vecina
  async function sacar(accion: () => Promise<unknown>) {
    const mover = prepararFoco(fila.current)
    if (await ejecutar(accion)) mover()
  }

  if (borrando) {
    return (
      <li className="list__item" ref={fila}>
        <div className="confirmar list__main">
          <span className="break">¿Borrar esta idea?</span>
          <button type="button" className="btn btn--danger" onClick={() => void sacar(() => borrarIdea(i.id))}>
            Borrar
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            autoFocus
            onClick={() => {
              volverA.current = botonBorrar
              setBorrando(false)
            }}
          >
            Cancelar
          </button>
        </div>
      </li>
    )
  }

  return (
    <li className="list__item idea" ref={fila}>
      <div className="list__main">
        <p className="break idea__texto">{i.texto}</p>
        <p className="t-small muted num">{fechaDe(i)}</p>
      </div>
      <div className="acciones">
        {!i.archivada && (
          <MenuDesplegable texto="Convertir en…" etiqueta={`Convertir en…: ${i.texto}`}>
            {DESTINOS_IDEA.map((d) => (
              <li key={d.ruta}>
                <Link to={`${d.ruta}?idea=${encodeURIComponent(i.id)}`} className="menu__item">
                  {d.texto}
                </Link>
              </li>
            ))}
          </MenuDesplegable>
        )}
        <button
          type="button"
          className="icon-btn"
          aria-label={i.archivada ? `Devolver a la bandeja: ${i.texto}` : `Archivar: ${i.texto}`}
          onClick={() => void sacar(() => archivarIdea(i.id, !i.archivada))}
        >
          <IconoArchivar />
        </button>
        <button type="button" ref={botonBorrar} className="icon-btn icon-btn--peligro" aria-label={`Borrar: ${i.texto}`} onClick={() => setBorrando(true)}>
          <IconoBorrar />
        </button>
      </div>
    </li>
  )
}
