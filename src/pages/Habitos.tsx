import { useId, useState, type CSSProperties, type FormEvent } from 'react'
import { AvisoError } from '../components/AvisoError'
import { Pagina } from '../components/Pagina'
import { Racha } from '../components/Racha'
import { Vacio } from '../components/Vacio'
import {
  IconoArchivar,
  IconoBajar,
  IconoBorrar,
  IconoEditar,
  IconoHabitos,
  IconoSubir,
} from '../components/iconos'
import { useAccion } from '../components/useAccion'
import { useHoy } from '../components/useHoy'
import { diaDelMes, diaSemanaCorto, diaSemanaLargo, formatearFecha, type FechaDia } from '../lib/fechas'
import { NOMBRE_HABITO_MAX, cuadricula, habitosActivos, type FilaCuadricula } from '../lib/habitos'
import {
  alternarDia,
  borrarHabito,
  crearHabito,
  editarHabito,
  reordenarHabitos,
  type Habito,
} from '../repos/habitos'
import { useHabitos, useMarcas } from '../repos/hooks'
import { useEstadoSync } from '../sync/hooks'

export function Habitos() {
  const dia = useHoy()
  const habitos = useHabitos()
  const marcas = useMarcas() // todas: hacen falta para las rachas
  const { primeraDescargaHecha } = useEstadoSync()
  const { error, ejecutar, limpiar } = useAccion()
  const [editando, setEditando] = useState(false)

  const lista = habitos.datos ?? []
  const datos = cuadricula(lista, marcas.datos ?? [], dia)
  const archivados = lista.filter((h) => h.archivado)
  const cargando = habitos.cargando || marcas.cargando || (lista.length === 0 && !primeraDescargaHecha)
  const errorLectura = habitos.error ?? marcas.error

  return (
    <Pagina
      titulo="Hábitos"
      accion={
        lista.length > 0 && (
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => setEditando((e) => !e)}
          >
            {editando ? 'Hecho' : 'Editar'}
          </button>
        )
      }
    >
      <div className="stack">
        {errorLectura && <AvisoError mensaje="No se han podido leer tus hábitos de este dispositivo. Recarga la página." />}
        <AvisoError mensaje={error} onCerrar={limpiar} />

        {cargando && lista.length === 0 ? (
          <Esqueleto />
        ) : datos.filas.length === 0 && !editando ? (
          <Vacio icono={<IconoHabitos />} titulo={archivados.length > 0 ? 'No tienes hábitos activos' : 'Aún no tienes hábitos'}>
            Añade uno abajo y márcalo cada día para empezar la racha.
            {archivados.length > 0 && ' Para recuperar uno archivado, pulsa Editar.'}
          </Vacio>
        ) : (
          <>
            {datos.filas.length > 0 && (
              <ResumenDeHoy hechos={datos.resumen.hechos} total={datos.resumen.total} porcentaje={datos.resumen.porcentaje} />
            )}
            {editando ? (
              habitosActivos(lista).length > 0 ? (
                <ListaEdicion habitos={habitosActivos(lista)} ejecutar={ejecutar} />
              ) : (
                <p className="muted">No tienes hábitos activos. Recupera uno de los archivados o añade uno nuevo.</p>
              )
            ) : (
              <Semana dias={datos.dias} filas={datos.filas} hoy={dia} ejecutar={ejecutar} />
            )}
          </>
        )}

        <AltaHabito ejecutar={ejecutar} />

        {editando && archivados.length > 0 && <Archivados habitos={archivados} ejecutar={ejecutar} />}
      </div>
    </Pagina>
  )
}

type Ejecutar = (accion: () => Promise<unknown>) => Promise<boolean>

function ResumenDeHoy({ hechos, total, porcentaje }: { hechos: number; total: number; porcentaje: number }) {
  return (
    <section className="card stack" aria-label="Hoy" style={{ '--gap': 'var(--sp-3)' } as CSSProperties}>
      <div className="row row--between">
        <p>
          <span className="num num--xl">
            {hechos}/{total}
          </span>{' '}
          <span className="muted">hechos hoy</span>
        </p>
        <p className="num muted">{porcentaje} %</p>
      </div>
      <div
        className={`progress${porcentaje === 100 ? ' progress--ok' : ''}`}
        role="progressbar"
        aria-label="Hábitos hechos hoy"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={porcentaje}
        style={{ '--p': `${porcentaje}%` } as CSSProperties}
      />
    </section>
  )
}

function Semana({
  dias,
  filas,
  hoy,
  ejecutar,
}: {
  dias: FechaDia[]
  filas: FilaCuadricula<Habito>[]
  hoy: FechaDia
  ejecutar: Ejecutar
}) {
  return (
    <section aria-labelledby="habitos-semana">
      <h2 id="habitos-semana" className="visually-hidden">
        Últimos 7 días
      </h2>
      <div className="week semana-cab" aria-hidden="true">
        {dias.map((d) => (
          <span key={d} className="week__day" aria-current={d === hoy ? 'date' : undefined}>
            <span>{diaSemanaCorto(d)}</span>
            <span className="num">{diaDelMes(d)}</span>
          </span>
        ))}
      </div>
      <ul className="list" role="list">
        {filas.map((fila) => (
          <li key={fila.habito.id} className="list__item habito">
            <div className="habito__cab">
              <span className="habito__nombre break">{fila.habito.nombre}</span>
              <Racha dias={fila.racha} />
            </div>
            <div className="week">
              {fila.dias.map((celda) => (
                <button
                  key={celda.fecha}
                  type="button"
                  className={`check${celda.esHoy ? ' check--today' : ''}`}
                  aria-pressed={celda.hecho}
                  aria-label={`${fila.habito.nombre}, ${diaSemanaLargo(celda.fecha)} ${formatearFecha(celda.fecha)}`}
                  onClick={() => void ejecutar(() => alternarDia(fila.habito.id, celda.fecha))}
                />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ListaEdicion({ habitos, ejecutar }: { habitos: Habito[]; ejecutar: Ejecutar }) {
  const mover = (indice: number, desplazamiento: -1 | 1) => {
    const ids = habitos.map((h) => h.id)
    const destino = indice + desplazamiento
    ;[ids[indice], ids[destino]] = [ids[destino], ids[indice]]
    void ejecutar(() => reordenarHabitos(ids))
  }

  return (
    <section aria-labelledby="habitos-editar">
      <h2 id="habitos-editar" className="visually-hidden">
        Editar hábitos
      </h2>
      <ul className="list" role="list">
        {habitos.map((h, i) => (
          <FilaEdicion
            key={h.id}
            habito={h}
            esPrimero={i === 0}
            esUltimo={i === habitos.length - 1}
            onSubir={() => mover(i, -1)}
            onBajar={() => mover(i, 1)}
            ejecutar={ejecutar}
          />
        ))}
      </ul>
    </section>
  )
}

function FilaEdicion({
  habito,
  esPrimero,
  esUltimo,
  onSubir,
  onBajar,
  ejecutar,
}: {
  habito: Habito
  esPrimero: boolean
  esUltimo: boolean
  onSubir: () => void
  onBajar: () => void
  ejecutar: Ejecutar
}) {
  const [renombrando, setRenombrando] = useState(false)
  const [nombre, setNombre] = useState(habito.nombre)
  const id = useId()

  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    if (await ejecutar(() => editarHabito(habito.id, { nombre }))) setRenombrando(false)
  }

  if (renombrando) {
    return (
      <li className="list__item">
        <form className="edicion row" onSubmit={(e) => void guardar(e)}>
          <label htmlFor={id} className="visually-hidden">
            Nombre del hábito
          </label>
          <input
            id={id}
            className="input"
            style={{ flex: '1 1 10rem' }}
            value={nombre}
            maxLength={NOMBRE_HABITO_MAX}
            onChange={(e) => setNombre(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn btn--primary">
            Guardar
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setNombre(habito.nombre)
              setRenombrando(false)
            }}
          >
            Cancelar
          </button>
        </form>
      </li>
    )
  }

  return (
    <li className="list__item">
      <span className="list__main break">{habito.nombre}</span>
      <div className="acciones">
        <button type="button" className="icon-btn" aria-label={`Subir ${habito.nombre}`} disabled={esPrimero} onClick={onSubir}>
          <IconoSubir />
        </button>
        <button type="button" className="icon-btn" aria-label={`Bajar ${habito.nombre}`} disabled={esUltimo} onClick={onBajar}>
          <IconoBajar />
        </button>
        <button type="button" className="icon-btn" aria-label={`Cambiar el nombre de ${habito.nombre}`} onClick={() => setRenombrando(true)}>
          <IconoEditar />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={`Archivar ${habito.nombre} (se guarda su historial)`}
          onClick={() => void ejecutar(() => editarHabito(habito.id, { archivado: true }))}
        >
          <IconoArchivar />
        </button>
      </div>
    </li>
  )
}

function Archivados({ habitos, ejecutar }: { habitos: Habito[]; ejecutar: Ejecutar }) {
  const [porBorrar, setPorBorrar] = useState<string | null>(null)

  return (
    <section className="stack" aria-labelledby="habitos-archivados" style={{ '--gap': 'var(--sp-2)' } as CSSProperties}>
      <h2 id="habitos-archivados" className="t-section">
        Archivados
      </h2>
      <p className="t-small muted">No salen en la semana ni en Inicio, pero conservan sus marcas.</p>
      <ul className="list" role="list">
        {habitos.map((h) => (
          <li key={h.id} className="list__item">
            {porBorrar === h.id ? (
              <div className="confirmar list__main">
                <span className="break">¿Borrar «{h.nombre}» y todas sus marcas?</span>
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={() => void ejecutar(() => borrarHabito(h.id)).then(() => setPorBorrar(null))}
                >
                  Borrar
                </button>
                {/* El foco va a la opción segura: el botón de la papelera ya no existe */}
                <button type="button" className="btn btn--ghost" onClick={() => setPorBorrar(null)} autoFocus>
                  Cancelar
                </button>
              </div>
            ) : (
              <>
                <span className="list__main break muted">{h.nombre}</span>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => void ejecutar(() => editarHabito(h.id, { archivado: false }))}
                >
                  Recuperar
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn--peligro"
                  aria-label={`Borrar ${h.nombre} para siempre`}
                  onClick={() => setPorBorrar(h.id)}
                >
                  <IconoBorrar />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function AltaHabito({ ejecutar }: { ejecutar: Ejecutar }) {
  const [nombre, setNombre] = useState('')
  const id = useId()

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (await ejecutar(() => crearHabito(nombre))) setNombre('')
  }

  return (
    <form className="alta" onSubmit={(e) => void enviar(e)} aria-label="Nuevo hábito">
      <div className="field">
        <label htmlFor={id} className="field__label">
          Nuevo hábito
        </label>
        <input
          id={id}
          className="input"
          value={nombre}
          maxLength={NOMBRE_HABITO_MAX}
          placeholder="Ej.: Estudiar 30 min"
          onChange={(e) => setNombre(e.target.value)}
          enterKeyHint="done"
        />
      </div>
      <button type="submit" className="btn btn--primary">
        Añadir
      </button>
    </form>
  )
}

function Esqueleto() {
  return (
    <div className="stack" role="status" aria-busy="true">
      <span className="visually-hidden">Cargando tus hábitos…</span>
      <span className="skeleton" style={{ '--h': '6rem' } as CSSProperties} />
      <span className="skeleton" style={{ '--h': '5rem' } as CSSProperties} />
      <span className="skeleton" style={{ '--h': '5rem' } as CSSProperties} />
    </div>
  )
}
