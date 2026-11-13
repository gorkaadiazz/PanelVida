import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { nombreDeUsuario, useSesion } from '../auth/useSesion'
import { AvisoError } from '../components/AvisoError'
import { EtiquetaFecha } from '../components/EtiquetaFecha'
import { Pagina } from '../components/Pagina'
import { prepararFoco } from '../components/foco'
import { Racha } from '../components/Racha'
import { IconoEstudios, IconoExterno, IconoFlecha, IconoHabitos, IconoTareas } from '../components/iconos'
import { useAccion } from '../components/useAccion'
import { useHoy } from '../components/useHoy'
import type { FechaDia } from '../lib/fechas'
import { URL_EXAMENES } from '../lib/enlaces'
import { proximoExamen, textoCuentaAtras } from '../lib/examenes'
import { cuadricula } from '../lib/habitos'
import { recuentoTareas } from '../lib/tareas'
import { alternarDia } from '../repos/habitos'
import { useExamenes, useHabitos, useMarcas, useTareas } from '../repos/hooks'
import { marcarTarea } from '../repos/tareas'
import { useEstadoSync } from '../sync/hooks'

const FORMATO_HOY = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})

/** Cuántas tareas pendientes se enseñan en la tarjeta. */
const TAREAS_EN_INICIO = 4

/** "Viernes, 13 de noviembre" a partir de una fecha de día. */
function fechaLarga(dia: FechaDia): string {
  const texto = FORMATO_HOY.format(Date.parse(`${dia}T00:00:00Z`))
  return texto.charAt(0).toLocaleUpperCase('es-ES') + texto.slice(1)
}

type Ejecutar = (accion: () => Promise<unknown>) => Promise<boolean>

export function Inicio() {
  const { usuario } = useSesion()
  const nombre = nombreDeUsuario(usuario).split(' ')[0]
  const dia = useHoy()
  const { error, ejecutar, limpiar } = useAccion()

  return (
    <Pagina titulo="Inicio" encabezado={nombre ? `Hola, ${nombre}` : 'Hola'} subtitulo={fechaLarga(dia)}>
      <div className="stack">
        <AvisoError mensaje={error} onCerrar={limpiar} />
        <div className="grid-cards">
          <TarjetaHabitos hoy={dia} ejecutar={ejecutar} />
          <TarjetaTareas hoy={dia} ejecutar={ejecutar} />
          <TarjetaExamen hoy={dia} />
        </div>
      </div>
    </Pagina>
  )
}

function TarjetaHabitos({ hoy, ejecutar }: { hoy: FechaDia; ejecutar: Ejecutar }) {
  const habitos = useHabitos()
  const marcas = useMarcas()
  const { primeraDescargaHecha } = useEstadoSync()
  const lista = habitos.datos ?? []
  const { filas, resumen } = cuadricula(lista, marcas.datos ?? [], hoy)
  const cargando = habitos.cargando || marcas.cargando || (lista.length === 0 && !primeraDescargaHecha)

  return (
    <section className="card" aria-labelledby="inicio-habitos">
      <div className="card__head">
        <h2 id="inicio-habitos" className="card__titulo">
          <IconoHabitos />
          Hábitos de hoy
        </h2>
        {filas.length > 0 && (
          <span className="num num--xl">
            {resumen.hechos}/{resumen.total}
          </span>
        )}
      </div>

      {cargando && filas.length === 0 ? (
        <Esqueleto />
      ) : filas.length === 0 ? (
        <p className="muted">Aún no tienes hábitos.</p>
      ) : (
        <>
          <div
            className={`progress${resumen.porcentaje === 100 ? ' progress--ok' : ''}`}
            role="progressbar"
            aria-label="Hábitos hechos hoy"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={resumen.porcentaje}
            style={{ '--p': `${resumen.porcentaje}%` } as CSSProperties}
          />
          <ul className="list" role="list" style={{ marginTop: 'var(--sp-2)' }}>
            {filas.map(({ habito, racha, dias }) => {
              const hecho = dias[dias.length - 1]?.hecho ?? false
              return (
                <li key={habito.id} className="list__item">
                  <button
                    type="button"
                    className="check check--lg"
                    aria-pressed={hecho}
                    aria-label={`${habito.nombre}, hoy`}
                    onClick={() => void ejecutar(() => alternarDia(habito.id, hoy))}
                  />
                  <span className="list__main break">{habito.nombre}</span>
                  <Racha dias={racha} />
                </li>
              )
            })}
          </ul>
        </>
      )}

      <div className="card__foot">
        <Link to="/habitos" className="btn btn--ghost">
          {filas.length === 0 && !cargando ? 'Añadir hábitos' : 'Ver la semana'}
          <IconoFlecha />
        </Link>
      </div>
    </section>
  )
}

function TarjetaTareas({ hoy, ejecutar }: { hoy: FechaDia; ejecutar: Ejecutar }) {
  const tareas = useTareas()
  const { primeraDescargaHecha } = useEstadoSync()
  const lista = tareas.datos ?? []
  const pendientes = lista.filter((t) => !t.hecha) // ya vienen ordenadas por fecha límite
  const { atrasadas, proximas } = recuentoTareas(lista, hoy)
  const cargando = tareas.cargando || (lista.length === 0 && !primeraDescargaHecha)
  const resto = pendientes.length - TAREAS_EN_INICIO

  return (
    <section className="card" aria-labelledby="inicio-tareas">
      <div className="card__head">
        <h2 id="inicio-tareas" className="card__titulo" tabIndex={-1}>
          <IconoTareas />
          Tareas
        </h2>
        {!cargando && (
          <span>
            <span className="num num--xl">{pendientes.length}</span>
            <span className="visually-hidden"> pendientes</span>
          </span>
        )}
      </div>

      {(atrasadas > 0 || proximas > 0) && (
        <p className="row" style={{ marginBottom: 'var(--sp-2)' }}>
          {atrasadas > 0 && <span className="tag tag--danger">{atrasadas === 1 ? '1 atrasada' : `${atrasadas} atrasadas`}</span>}
          {proximas > 0 && <span className="tag tag--warn">{proximas} para hoy o mañana</span>}
        </p>
      )}

      {cargando && pendientes.length === 0 ? (
        <Esqueleto />
      ) : pendientes.length === 0 ? (
        <p className="muted">No tienes nada pendiente.</p>
      ) : (
        <ul className="list" role="list">
          {pendientes.slice(0, TAREAS_EN_INICIO).map((t) => (
            <li key={t.id} className="list__item">
              <button
                type="button"
                className="check"
                aria-pressed={false}
                aria-label={`Hecha: ${t.texto}`}
                onClick={(e) => {
                  // La fila desaparece: el foco pasa a la siguiente tarea
                  const mover = prepararFoco(e.currentTarget.closest('li'))
                  void ejecutar(() => marcarTarea(t.id, true)).then((bien) => bien && mover())
                }}
              />
              <div className="list__main">
                <p className="tarea__texto">{t.texto}</p>
                {t.fecha_limite && (
                  <p className="tarea__meta">
                    <EtiquetaFecha tarea={t} hoy={hoy} />
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="card__foot">
        <Link to="/tareas" className="btn btn--ghost">
          {resto > 0 ? `Ver las ${pendientes.length}` : pendientes.length === 0 && !cargando ? 'Añadir una tarea' : 'Ver todas'}
          <IconoFlecha />
        </Link>
      </div>
    </section>
  )
}

function TarjetaExamen({ hoy }: { hoy: FechaDia }) {
  const examenes = useExamenes()
  const { primeraDescargaHecha } = useEstadoSync()
  const examen = examenes.datos ? proximoExamen(examenes.datos.evaluaciones, examenes.datos.modulos, hoy) : null
  const cargando = examenes.cargando || (!examen && !primeraDescargaHecha)

  return (
    <section className={`card${examen?.modulo?.clase ? ` card--mod ${examen.modulo.clase}` : ''}`} aria-labelledby="inicio-examen">
      <div className="card__head">
        <h2 id="inicio-examen" className="card__titulo">
          <IconoEstudios />
          Próximo examen
        </h2>
        {examen && (
          <span className={`num num--xl${examen.dias <= 1 ? ' text-warn' : ''}`}>
            {examen.dias <= 1 ? textoCuentaAtras(examen.dias) : (
              <>
                {examen.dias}
                <span className="num--unit">días</span>
              </>
            )}
          </span>
        )}
      </div>

      {cargando && !examen ? (
        <Esqueleto />
      ) : !examen ? (
        <p className="muted">No tienes exámenes pendientes apuntados.</p>
      ) : (
        <div className="stack" style={{ '--gap': 'var(--sp-2)' } as CSSProperties}>
          <p className="break" style={{ fontWeight: 'var(--fw-medium)' }}>
            {examen.titulo}
          </p>
          <p className="row">
            {examen.modulo && (
              <span className={examen.modulo.clase ? `tag tag--mod ${examen.modulo.clase}` : 'tag'} title={examen.modulo.nombre}>
                {examen.modulo.abreviatura}
                <span className="visually-hidden"> ({examen.modulo.nombre})</span>
              </span>
            )}
            <span className="tag">{examen.tipo}</span>
          </p>
          <p className="muted">
            <span className="num">{examen.fecha}</span>
            {examen.hora && (
              <>
                {' a las '}
                <span className="num">{examen.hora}</span>
              </>
            )}
            {examen.dias > 1 && <span className="visually-hidden"> ({textoCuentaAtras(examen.dias)})</span>}
          </p>
        </div>
      )}

      <div className="card__foot">
        <a href={URL_EXAMENES} target="_blank" rel="noopener noreferrer" className="btn btn--ghost">
          Abrir la web de exámenes
          <IconoExterno />
          <span className="visually-hidden"> (se abre en otra pestaña)</span>
        </a>
      </div>
    </section>
  )
}

function Esqueleto() {
  return (
    <div className="stack" role="status" aria-busy="true" style={{ '--gap': 'var(--sp-2)' } as CSSProperties}>
      <span className="visually-hidden">Cargando…</span>
      <span className="skeleton" style={{ '--h': '2.5rem' } as CSSProperties} />
      <span className="skeleton" style={{ '--h': '2.5rem' } as CSSProperties} />
    </div>
  )
}
