import { useEffect, useId, useState, type CSSProperties } from 'react'
import { HORA_POR_DEFECTO, HORAS, textoHora } from '../lib/recordatorios'
import { activarRecordatorios, cambiarHora, desactivarRecordatorios, estadoRecordatorios, type EstadoRecordatorios } from '../repos/recordatorios'
import { AvisoError } from './AvisoError'
import { useAccion } from './useAccion'

/**
 * Recordatorios en ESTE dispositivo: un aviso al día, a la hora elegida, si
 * quedan hábitos por marcar, tareas que vencen o un examen al día siguiente.
 */
export function Recordatorios() {
  const id = useId()
  const [estado, setEstado] = useState<EstadoRecordatorios | 'cargando' | 'error'>('cargando')
  const [hora, setHora] = useState(HORA_POR_DEFECTO)
  const [ocupado, setOcupado] = useState(false)
  const { error, ejecutar, limpiar } = useAccion()

  // Lee si este navegador está suscrito (y a qué hora): necesita conexión
  const leer = () =>
    estadoRecordatorios().then(
      (e) => {
        setEstado(e)
        if (e.tipo === 'activado') setHora(e.hora)
      },
      () => setEstado('error'),
    )

  useEffect(() => {
    void leer()
  }, [])

  async function hacer(accion: () => Promise<unknown>) {
    setOcupado(true)
    await ejecutar(accion)
    await leer()
    setOcupado(false)
  }

  const activado = typeof estado === 'object' && estado.tipo === 'activado'

  return (
    <section className="card stack" aria-labelledby={`${id}-titulo`} style={{ '--gap': 'var(--sp-3)' } as CSSProperties}>
      <h2 id={`${id}-titulo`} className="t-section">
        Recordatorios
      </h2>
      <p className="t-small muted">
        Un aviso al día en este dispositivo si te quedan hábitos por marcar, tareas que vencen o un examen al día siguiente. Solo dice
        cuántos, no cuáles.
      </p>
      <AvisoError mensaje={error} onCerrar={limpiar} />

      {estado === 'cargando' ? (
        <span className="skeleton" aria-hidden="true" style={{ '--h': '2.75rem' } as CSSProperties} />
      ) : estado === 'error' ? (
        <p className="t-small">No se ha podido saber si están activados. Comprueba la conexión.</p>
      ) : estado.tipo === 'sin-configurar' ? (
        <p className="t-small">Aún no están disponibles en esta app.</p>
      ) : estado.tipo === 'no-soportado' ? (
        <p className="t-small">
          Este navegador no permite notificaciones. En iPhone, primero añade Mi Panel a la pantalla de inicio (Compartir → Añadir a pantalla
          de inicio) y ábrela desde ahí.
        </p>
      ) : estado.tipo === 'bloqueado' ? (
        <p className="t-small">Has bloqueado las notificaciones de esta web. Actívalas en los ajustes del navegador y vuelve aquí.</p>
      ) : (
        <>
          <div className="field" style={{ maxWidth: '12rem' }}>
            <label htmlFor={`${id}-hora`} className="field__label">
              Hora del aviso
            </label>
            <select
              id={`${id}-hora`}
              className="input"
              value={hora}
              disabled={ocupado}
              onChange={(e) => {
                const nueva = Number(e.target.value)
                setHora(nueva)
                if (activado) void hacer(() => cambiarHora(nueva))
              }}
            >
              {HORAS.map((h) => (
                <option key={h} value={h}>
                  {textoHora(h)}
                </option>
              ))}
            </select>
          </div>
          <div>
            {activado ? (
              <button type="button" className="btn btn--secondary" disabled={ocupado} aria-busy={ocupado || undefined} onClick={() => void hacer(desactivarRecordatorios)}>
                Desactivar recordatorios
              </button>
            ) : (
              <button type="button" className="btn btn--primary" disabled={ocupado} aria-busy={ocupado || undefined} onClick={() => void hacer(() => activarRecordatorios(hora))}>
                Activar recordatorios
              </button>
            )}
          </div>
          <p className="t-small muted" role="status">
            {activado ? `Activados: te avisaremos sobre las ${textoHora(hora)}.` : 'Desactivados en este dispositivo.'}
          </p>
        </>
      )}
    </section>
  )
}
