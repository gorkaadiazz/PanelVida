import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { nombreDeUsuario, useSesion } from '../auth/useSesion'
import { AvisoError } from '../components/AvisoError'
import { EtiquetaFecha } from '../components/EtiquetaFecha'
import { Pagina } from '../components/Pagina'
import { prepararFoco } from '../components/foco'
import { Racha } from '../components/Racha'
import { IconoDinero, IconoEstudios, IconoCumple, IconoExterno, IconoFlecha, IconoHabitos, IconoIdea, IconoNegocio, IconoPlan, IconoTareas } from '../components/iconos'
import { useAccion } from '../components/useAccion'
import { useHoy } from '../components/useHoy'
import { diferenciaDias, formatearFecha, type FechaDia } from '../lib/fechas'
import { formatearEuros, mesDe, progresoMeta, resumenMes, resumir } from '../lib/dinero'
import { URL_EXAMENES } from '../lib/enlaces'
import { proximoExamen, textoCuentaAtras } from '../lib/examenes'
import { cuadricula } from '../lib/habitos'
import { resumenNegocio } from '../lib/negocio'
import { porcentaje, resumenSemana, textoComparacion } from '../lib/semana'
import { ideasSinProcesar } from '../lib/ideas'
import { esTipoPlan, NOMBRE_TIPO_PLAN, proximoPlan } from '../lib/planes'
import { DIAS_EN_INICIO, proximosDias, textoCuentaAtras as cuentaAtrasCumple, textoDiaMes } from '../lib/cumpleanos'
import { recuentoTareas } from '../lib/tareas'
import { alternarDia } from '../repos/habitos'
import { useClientes, useCumpleanos, useExamenes, useFijos, useHabitos, useIdeas, useMarcas, useMovimientos, usePerfil, usePlanes, useRevisiones, useTareas } from '../repos/hooks'
import { leerDatosRevision, nombrePeriodo, textoCambio, type TipoRevision } from '../lib/revision'
import { ahorroTotal, cuandoLlego, lineaMeta, ritmoAhorro } from '../lib/prevision'
import { leerVentana } from '../components/ventanaPrevision'
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
          <TarjetaCumples hoy={dia} />
          <TarjetaPlan hoy={dia} />
          <TarjetaAhorro hoy={dia} />
          <TarjetaRevision />
          <TarjetaNegocio />
          <TarjetaSemana hoy={dia} />
          <TarjetaIdeas />
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
        {examen &&
          (examen.dias <= 1 ? (
            // "Hoy" / "Mañana": la palabra es la señal; el ámbar solo la refuerza
            <span className="cuenta-atras text-warn">{textoCuentaAtras(examen.dias)}</span>
          ) : (
            <span className="num num--xl">
              {examen.dias}
              <span className="num--unit">días</span>
            </span>
          ))}
      </div>

      {cargando && !examen ? (
        <Esqueleto />
      ) : !examen ? (
        <p className="muted">No tienes exámenes pendientes apuntados.</p>
      ) : (
        <div className="stack" style={{ '--gap': 'var(--sp-2)' } as CSSProperties}>
          <p className="examen__titulo" title={examen.titulo}>
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

function TarjetaAhorro({ hoy }: { hoy: FechaDia }) {
  const movimientos = useMovimientos()
  const perfil = usePerfil()
  const { primeraDescargaHecha } = useEstadoSync()
  const lista = movimientos.datos ?? []
  const cargando = movimientos.cargando || (lista.length === 0 && !primeraDescargaHecha)
  const delMes = resumenMes(lista, mesDe(hoy))
  const fijos = useFijos()
  const meta = perfil.datos?.meta_ahorro_centimos ?? null
  const progreso = progresoMeta(resumir(lista).ahorro, meta)
  // «A este ritmo llegas a tu meta el …» (sin datos aún, no se dice nada)
  const ritmo = ritmoAhorro(lista, fijos.datos ?? [], leerVentana(), hoy)
  const linea = meta !== null && ritmo.aviso !== 'sin_datos' ? lineaMeta(cuandoLlego(ahorroTotal(lista), meta, ritmo.mensual, hoy), hoy) : null

  return (
    <section className="card" aria-labelledby="inicio-ahorro">
      <div className="card__head">
        <h2 id="inicio-ahorro" className="card__titulo">
          <IconoDinero />
          Ahorro del mes
        </h2>
      </div>
      {cargando && lista.length === 0 ? (
        <Esqueleto />
      ) : (
        <div className="stack" style={{ '--gap': 'var(--sp-2)' } as CSSProperties}>
          <p className={`num num--xl${delMes.ahorro < 0 ? ' text-danger' : ''}`}>{formatearEuros(delMes.ahorro)}</p>
          <p className="t-small muted">
            Ingresos <span className="num">{formatearEuros(delMes.ingresos)}</span> · gastos{' '}
            <span className="num">{formatearEuros(delMes.gastos)}</span>
          </p>
          {progreso && meta !== null && (
            <>
              <div
                className={`progress${progreso.conseguida ? ' progress--ok' : ''}`}
                role="progressbar"
                aria-label="Progreso hacia la meta de ahorro"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progreso.porcentaje}
                style={{ '--p': `${progreso.porcentaje}%` } as CSSProperties}
              />
              <p className="t-small muted">
                {progreso.conseguida ? 'Meta conseguida' : <><span className="num">{progreso.porcentaje} %</span> de la meta</>} ·{' '}
                <span className="num">{formatearEuros(meta)}</span>
              </p>
              {linea && (
                <p className="t-small">
                  <Link to="/dinero?ver=prevision">{linea}</Link>
                </p>
              )}
            </>
          )}
        </div>
      )}
      <div className="card__foot">
        <Link to="/dinero" className="btn btn--ghost">
          {lista.length === 0 && !cargando ? 'Apuntar un gasto' : 'Ver Dinero'}
          <IconoFlecha />
        </Link>
      </div>
    </section>
  )
}

/** Solo si hay una revisión de ahorro sin ver (la más reciente). */
function TarjetaRevision() {
  const revisiones = useRevisiones()
  const nueva = (revisiones.datos ?? []).find((r) => !r.vista)
  if (!nueva) return null
  const datos = leerDatosRevision(nueva.datos)
  const periodo = nombrePeriodo({ tipo: nueva.tipo as TipoRevision, inicio: nueva.inicio, fin: nueva.fin })
  const sugerencias = datos?.sugerencias.length ?? 0

  return (
    <section className="card" aria-labelledby="inicio-revision">
      <div className="card__head">
        <h2 id="inicio-revision" className="card__titulo">
          <IconoDinero />
          Revisión nueva
        </h2>
      </div>
      <div className="stack" style={{ '--gap': 'var(--sp-2)' } as CSSProperties}>
        <p>{periodo.replace(/^./, (c) => c.toLocaleUpperCase('es-ES'))}</p>
        {datos && (
          <p className="t-small muted">
            Gastaste <span className="num">{formatearEuros(datos.gastos)}</span> ({textoCambio(datos.gastos, datos.gastos_anterior)})
            {sugerencias > 0 && ` · ${sugerencias === 1 ? '1 idea' : `${sugerencias} ideas`} para ahorrar`}
          </p>
        )}
      </div>
      <div className="card__foot">
        <Link to="/dinero?ver=revisiones" className="btn btn--ghost">
          Ver la revisión
          <IconoFlecha />
        </Link>
      </div>
    </section>
  )
}

function TarjetaNegocio() {
  const clientes = useClientes()
  const { primeraDescargaHecha } = useEstadoSync()
  const lista = clientes.datos ?? []
  const cargando = clientes.cargando || (lista.length === 0 && !primeraDescargaHecha)
  const r = resumenNegocio(lista)

  return (
    <section className="card" aria-labelledby="inicio-negocio">
      <div className="card__head">
        <h2 id="inicio-negocio" className="card__titulo">
          <IconoNegocio />
          Negocio
        </h2>
        {!cargando && (
          <span className="num num--xl">
            {r.porEstado.en_curso}
            <span className="num--unit">en curso</span>
          </span>
        )}
      </div>
      {cargando && lista.length === 0 ? (
        <Esqueleto />
      ) : lista.length === 0 ? (
        <p className="muted">Aún no tienes clientes.</p>
      ) : (
        <dl className="cifras">
          <dt>Importe en curso</dt>
          <dd className="num">{formatearEuros(r.enCurso)}</dd>
          <dt>Facturado</dt>
          <dd className="num">{formatearEuros(r.facturado)}</dd>
          <dt>Pendientes de cerrar</dt>
          <dd className="num">{r.porEstado.contacto + r.porEstado.propuesta}</dd>
        </dl>
      )}
      <div className="card__foot">
        <Link to="/negocio" className="btn btn--ghost">
          {lista.length === 0 && !cargando ? 'Añadir un cliente' : 'Ver Negocio'}
          <IconoFlecha />
        </Link>
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

/** Esta semana (lunes a hoy) frente a los mismos días de la semana pasada. */
function TarjetaSemana({ hoy }: { hoy: FechaDia }) {
  const habitos = useHabitos()
  const marcas = useMarcas()
  const tareas = useTareas()
  const movimientos = useMovimientos()
  const { primeraDescargaHecha } = useEstadoSync()
  const cargando = habitos.cargando || marcas.cargando || tareas.cargando || movimientos.cargando || !primeraDescargaHecha
  const r = resumenSemana(
    { habitos: habitos.datos ?? [], marcas: marcas.datos ?? [], tareas: tareas.datos ?? [], movimientos: movimientos.datos ?? [] },
    hoy,
  )
  const pct = porcentaje(r.actual.habitosHechos, r.actual.habitosPosibles)
  const pctAntes = porcentaje(r.anterior.habitosHechos, r.anterior.habitosPosibles)

  return (
    <section className="card" aria-labelledby="inicio-semana">
      <div className="card__head">
        <h2 id="inicio-semana" className="card__titulo">
          Esta semana
        </h2>
        <span className="t-small muted">{r.dias === 7 ? 'De lunes a domingo' : r.dias === 1 ? 'Hoy lunes' : 'De lunes a hoy'}</span>
      </div>
      {cargando && !habitos.datos?.length && !movimientos.datos?.length ? (
        <Esqueleto />
      ) : (
        <dl className="semana">
          <div>
            <dt>Hábitos cumplidos</dt>
            <dd>
              {/* Sin hábitos no hay porcentaje: una frase en vez de una raya que no se entiende ni se lee */}
              {r.actual.habitosPosibles > 0 ? <span className="num num--lg">{pct} %</span> : <span className="muted">Aún no hay hábitos que marcar</span>}
              {r.actual.habitosPosibles > 0 && (
                <span className="t-small muted">
                  <span className="num">
                    {r.actual.habitosHechos}/{r.actual.habitosPosibles}
                  </span>{' '}
                  · {textoComparacion(pct, pctAntes, (n) => `${n} puntos`)}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt>Tareas hechas</dt>
            <dd>
              <span className="num num--lg">{r.actual.tareasHechas}</span>
              <span className="t-small muted">{textoComparacion(r.actual.tareasHechas, r.anterior.tareasHechas)}</span>
            </dd>
          </div>
          <div>
            <dt>Ahorrado</dt>
            <dd>
              <span className={`num num--lg${r.actual.ahorro < 0 ? ' text-danger' : ''}`}>{formatearEuros(r.actual.ahorro)}</span>
              <span className="t-small muted">{textoComparacion(r.actual.ahorro, r.anterior.ahorro, formatearEuros)}</span>
            </dd>
          </div>
        </dl>
      )}
    </section>
  )
}

/** Cuántas ideas hay sin procesar en la bandeja. */
function TarjetaIdeas() {
  const ideas = useIdeas()
  const { primeraDescargaHecha } = useEstadoSync()
  const lista = ideas.datos ?? []
  const sinProcesar = ideasSinProcesar(lista).length
  const cargando = ideas.cargando || (lista.length === 0 && !primeraDescargaHecha)

  return (
    <section className="card" aria-labelledby="inicio-ideas">
      <div className="card__head">
        <h2 id="inicio-ideas" className="card__titulo">
          <IconoIdea />
          Ideas
        </h2>
        {!cargando && <span className="num num--xl">{sinProcesar}</span>}
      </div>
      {cargando ? (
        <Esqueleto />
      ) : (
        <p className="muted">
          {sinProcesar === 0 ? 'Bandeja vacía. Apunta con el botón «+».' : sinProcesar === 1 ? '1 idea sin procesar.' : `${sinProcesar} ideas sin procesar.`}
        </p>
      )}
      <div className="card__foot">
        <Link to="/ideas" className="btn btn--ghost">
          Ver la bandeja
          <IconoFlecha />
        </Link>
      </div>
    </section>
  )
}

/** Cumpleaños de hoy a dentro de 7 días. */
function TarjetaCumples({ hoy }: { hoy: FechaDia }) {
  const cumples = useCumpleanos()
  const { primeraDescargaHecha } = useEstadoSync()
  const lista = cumples.datos ?? []
  const cerca = proximosDias(lista, hoy)
  const cargando = cumples.cargando || (lista.length === 0 && !primeraDescargaHecha)

  return (
    <section className="card" aria-labelledby="inicio-cumples">
      <div className="card__head">
        <h2 id="inicio-cumples" className="card__titulo">
          <IconoCumple />
          Cumpleaños
        </h2>
      </div>
      {cargando && lista.length === 0 ? (
        <Esqueleto />
      ) : cerca.length === 0 ? (
        <p className="muted">{lista.length ? `Ninguno en los próximos ${DIAS_EN_INICIO} días.` : 'Aún no has apuntado ninguno.'}</p>
      ) : (
        <ul className="list" role="list">
          {cerca.map((p) => (
            <li key={p.cumple.id} className="list__item">
              <span className={`cumple__cuenta${p.dias === 0 ? ' cumple__cuenta--hoy' : ''}`}>
                {cuentaAtrasCumple(p.dias).replace(/^./, (x) => x.toLocaleUpperCase('es-ES'))}
              </span>
              <span className="list__main break">
                {p.cumple.nombre}
                <span className="t-small muted">
                  {' · '}
                  {textoDiaMes(p.cumple.dia, p.cumple.mes)}
                  {p.edad !== null && <> · <span className="num">{p.edad}</span> años</>}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="card__foot">
        <Link to="/cumpleanos" className="btn btn--ghost">
          {lista.length === 0 && !cargando ? 'Apuntar cumpleaños' : 'Ver todos'}
          <IconoFlecha />
        </Link>
      </div>
    </section>
  )
}

/** El próximo plan con fecha. */
function TarjetaPlan({ hoy }: { hoy: FechaDia }) {
  const planes = usePlanes()
  const { primeraDescargaHecha } = useEstadoSync()
  const lista = planes.datos ?? []
  const plan = proximoPlan(lista, hoy)
  const cargando = planes.cargando || (lista.length === 0 && !primeraDescargaHecha)
  const dias = plan?.fecha ? diferenciaDias(hoy, plan.fecha) : 0

  return (
    <section className="card" aria-labelledby="inicio-plan">
      <div className="card__head">
        <h2 id="inicio-plan" className="card__titulo">
          <IconoPlan />
          Próximo plan
        </h2>
      </div>
      {cargando && lista.length === 0 ? (
        <Esqueleto />
      ) : !plan ? (
        <p className="muted">{lista.length ? 'Ningún plan con fecha. Ponle fecha a alguna idea.' : 'Aún no tienes planes.'}</p>
      ) : (
        <div className="stack" style={{ '--gap': 'var(--sp-1)' } as CSSProperties}>
          <p className="break" style={{ fontWeight: 'var(--fw-medium)' }}>
            {plan.titulo}
          </p>
          <p className="t-small muted">
            <span className="num">{formatearFecha(plan.fecha!)}</span> · {dias === 0 ? 'hoy' : dias === 1 ? 'mañana' : `en ${dias} días`}
            {' · '}
            {esTipoPlan(plan.tipo) ? NOMBRE_TIPO_PLAN[plan.tipo] : 'Otro'}
            {plan.con_quien && ` · con ${plan.con_quien}`}
          </p>
        </div>
      )}
      <div className="card__foot">
        <Link to="/planes" className="btn btn--ghost">
          {lista.length === 0 && !cargando ? 'Apuntar un plan' : 'Ver planes'}
          <IconoFlecha />
        </Link>
      </div>
    </section>
  )
}
