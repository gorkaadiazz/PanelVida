import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { nombreDeUsuario, useSesion } from '../auth/useSesion'
import { AvisoError } from '../components/AvisoError'
import { EtiquetaFecha } from '../components/EtiquetaFecha'
import { Pagina } from '../components/Pagina'
import { Racha } from '../components/Racha'
import { IconoFlecha, IconoHabitos, IconoTareas } from '../components/iconos'
import { useAccion } from '../components/useAccion'
import { useHoy } from '../components/useHoy'
import type { FechaDia } from '../lib/fechas'
import { cuadricula } from '../lib/habitos'
import { recuentoTareas } from '../lib/tareas'
import { alternarDia } from '../repos/habitos'
import { useHabitos, useMarcas, useTareas } from '../repos/hooks'
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
        <Link to="/habitos" className="btn btn--ghost btn--sm">
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
        <h2 id="inicio-tareas" className="card__titulo">
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
                onClick={() => void ejecutar(() => marcarTarea(t.id, true))}
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
        <Link to="/tareas" className="btn btn--ghost btn--sm">
          {resto > 0 ? `Ver las ${pendientes.length}` : pendientes.length === 0 && !cargando ? 'Añadir una tarea' : 'Ver todas'}
          <IconoFlecha />
        </Link>
      </div>
    </section>
  )
}

function Esqueleto() {
  return (
    <div className="stack" aria-busy="true" aria-label="Cargando" style={{ '--gap': 'var(--sp-2)' } as CSSProperties}>
      <span className="skeleton" style={{ '--h': '2.5rem' } as CSSProperties} />
      <span className="skeleton" style={{ '--h': '2.5rem' } as CSSProperties} />
    </div>
  )
}
