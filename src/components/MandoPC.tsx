// Botones del Mando de un PC: energía, volumen, multimedia y abrir apps, y
// lo que ha pasado con las últimas órdenes. Si el PC está apagado, los
// botones se desactivan (y la orden caducaría a los 30 s de todos modos).

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { useSesion } from '../auth/useSesion'
import { CON_CONFIRMACION, NOMBRE_ACCION, TEXTO_ESTADO, describirComando, estadoVisible, volumenValido, type Accion } from '../lib/mando'
import type { PC } from '../repos/agentes'
import { escucharOrdenes, mandarOrden, ultimasOrdenes, type Comando } from '../repos/mando'

type Ejecutar = (accion: () => Promise<unknown>) => Promise<boolean>

export function MandoPC({ pc, encendido, ahora, ejecutar }: { pc: PC; encendido: boolean; ahora: number; ejecutar: Ejecutar }) {
  const id = useId()
  const { usuario } = useSesion()
  const [ordenes, setOrdenes] = useState<Comando[]>([])
  const [confirmar, setConfirmar] = useState<Accion | null>(null)
  const [volumen, setVolumen] = useState<number>(pc.volumen ?? 50)
  const arrastrando = useRef(false)
  const botonConfirmar = useRef<HTMLButtonElement | null>(null)

  // El volumen real llega con el latido (si no se está moviendo el control)
  useEffect(() => {
    if (!arrastrando.current && pc.volumen !== null) setVolumen(Math.min(100, pc.volumen))
  }, [pc.volumen])

  const cargar = useCallback(() => {
    ultimasOrdenes(pc.id).then(setOrdenes, () => {})
  }, [pc.id])
  useEffect(() => {
    if (!usuario) return
    cargar()
    return escucharOrdenes(usuario.id, cargar)
  }, [usuario, cargar])

  const mandar = (accion: Accion, valor: string | null = null) => void ejecutar(() => mandarOrden(pc.id, accion, valor))
  const pulsar = (accion: Accion) => {
    if (CON_CONFIRMACION.has(accion)) {
      setConfirmar(accion)
      requestAnimationFrame(() => botonConfirmar.current?.focus())
    } else mandar(accion)
  }
  const apagado = !encendido

  const boton = (accion: Accion, texto = NOMBRE_ACCION[accion], peligro = false) => (
    <button key={accion} type="button" className={`btn ${peligro ? 'btn--danger-text btn--ghost' : 'btn--secondary'} mando__boton`} disabled={apagado} onClick={() => pulsar(accion)}>
      {texto}
    </button>
  )

  return (
    <div className="stack mando" style={{ '--gap': 'var(--sp-4)' } as CSSProperties}>
      {apagado && <p className="t-small muted">El PC está apagado: los botones se activan cuando se encienda.</p>}

      {confirmar && (
        <div className="confirmar" role="group" aria-labelledby={`${id}-confirmar`}>
          <span id={`${id}-confirmar`} className="break">
            ¿{NOMBRE_ACCION[confirmar]} «{pc.nombre}»? Si hay algo sin guardar, se perderá.
          </span>
          <button
            type="button"
            ref={botonConfirmar}
            className="btn btn--danger"
            onClick={() => {
              mandar(confirmar)
              setConfirmar(null)
            }}
          >
            {NOMBRE_ACCION[confirmar]}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setConfirmar(null)}>
            Cancelar
          </button>
        </div>
      )}

      <section aria-labelledby={`${id}-energia`} className="stack" style={{ '--gap': 'var(--sp-2)' } as CSSProperties}>
        <h3 id={`${id}-energia`} className="t-label">
          Energía
        </h3>
        <div className="mando__grupo">
          {boton('bloquear', 'Bloquear')}
          {boton('suspender')}
          {boton('reiniciar', undefined, true)}
          {boton('apagar', undefined, true)}
        </div>
      </section>

      <section aria-labelledby={`${id}-sonido`} className="stack" style={{ '--gap': 'var(--sp-2)' } as CSSProperties}>
        <h3 id={`${id}-sonido`} className="t-label">
          Sonido{pc.volumen !== null && <span className="muted num"> · {pc.silenciado ? 'silenciado' : `${pc.volumen} %`}</span>}
        </h3>
        <div className="field">
          <label htmlFor={`${id}-volumen`} className="visually-hidden">
            Volumen
          </label>
          <input
            id={`${id}-volumen`}
            type="range"
            className="mando__volumen"
            min={0}
            max={100}
            step={5}
            value={volumen}
            disabled={apagado}
            aria-valuetext={`${volumen} %`}
            onPointerDown={() => {
              arrastrando.current = true
            }}
            onChange={(e) => setVolumen(Number(e.target.value))}
            // Se manda al soltar (no una orden por cada paso)
            onPointerUp={(e) => {
              arrastrando.current = false
              const v = volumenValido(Number((e.target as HTMLInputElement).value))
              if (v) mandar('volumen', v)
            }}
            onKeyUp={(e) => {
              if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) return
              const v = volumenValido(Number((e.target as HTMLInputElement).value))
              if (v) mandar('volumen', v)
            }}
          />
        </div>
        <div className="mando__grupo">
          {boton('volumen_bajar', 'Bajar')}
          {boton('volumen_subir', 'Subir')}
          {boton('silenciar', pc.silenciado ? 'Quitar silencio' : 'Silenciar')}
        </div>
      </section>

      <section aria-labelledby={`${id}-musica`} className="stack" style={{ '--gap': 'var(--sp-2)' } as CSSProperties}>
        <h3 id={`${id}-musica`} className="t-label">
          Música y vídeo
        </h3>
        <div className="mando__grupo">
          {boton('anterior')}
          {boton('play_pausa', 'Play / pausa')}
          {boton('siguiente')}
        </div>
      </section>

      <section aria-labelledby={`${id}-apps`} className="stack" style={{ '--gap': 'var(--sp-2)' } as CSSProperties}>
        <h3 id={`${id}-apps`} className="t-label">
          Abrir
        </h3>
        {pc.apps.length === 0 ? (
          <p className="t-small muted">Pon las apps que quieras abrir en ~/.config/mipanel/config.json del PC (mira la guía del agente).</p>
        ) : (
          <div className="mando__grupo">
            {pc.apps.map((app) => (
              <button key={app} type="button" className="btn btn--secondary mando__boton" disabled={apagado} onClick={() => mandar('abrir_app', app)}>
                {app}
              </button>
            ))}
          </div>
        )}
      </section>

      {ordenes.length > 0 && (
        <section aria-labelledby={`${id}-ultimas`}>
          <h3 id={`${id}-ultimas`} className="t-label">
            Últimas órdenes
          </h3>
          <ul className="list" role="list" aria-live="polite">
            {ordenes.map((o) => {
              const e = estadoVisible(o, ahora)
              return (
                <li key={o.id} className="list__item mando__orden">
                  <span className="list__main break">{describirComando(o)}</span>
                  <span className={`tag ${e === 'hecho' ? 'tag--ok' : e === 'error' ? 'tag--danger' : e === 'caducado' ? 'tag--warn' : ''} mando__estado`}>
                    {TEXTO_ESTADO[e]}
                    {e === 'error' && o.mensaje ? `: ${o.mensaje}` : ''}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
