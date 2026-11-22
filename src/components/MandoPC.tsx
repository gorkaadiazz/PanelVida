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
  // Teclado y lector de pantalla mueven el control a pasos: se espera a que
  // paren un momento y se manda UNA orden con el valor final.
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ultimoMandado = useRef<string | null>(pc.volumen === null ? null : String(pc.volumen))
  const botonCancelar = useRef<HTMLButtonElement | null>(null)
  const botones = useRef<Partial<Record<Accion, HTMLButtonElement | null>>>({})

  // El volumen real llega con el latido (si no se está moviendo el control)
  useEffect(() => {
    if (!arrastrando.current && !espera.current && pc.volumen !== null) {
      setVolumen(Math.min(100, pc.volumen))
      ultimoMandado.current = String(Math.min(100, pc.volumen))
    }
  }, [pc.volumen])
  useEffect(() => () => {
    if (espera.current) clearTimeout(espera.current)
  }, [])

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
      // El foco va a «Cancelar» (lo seguro): un doble Intro no apaga el PC
      requestAnimationFrame(() => botonCancelar.current?.focus())
    } else mandar(accion)
  }
  /** Cierra la confirmación y devuelve el foco al botón que la abrió. */
  const cerrarConfirmar = () => {
    const accion = confirmar
    setConfirmar(null)
    if (accion) requestAnimationFrame(() => botones.current[accion]?.focus())
  }
  const apagado = !encendido

  const mandarVolumen = (valor: number) => {
    if (espera.current) clearTimeout(espera.current)
    espera.current = null
    const v = volumenValido(valor)
    if (!v || v === ultimoMandado.current) return
    ultimoMandado.current = v
    mandar('volumen', v)
  }
  const mandarVolumenLuego = (valor: number) => {
    if (espera.current) clearTimeout(espera.current)
    espera.current = setTimeout(() => mandarVolumen(valor), 600)
  }

  const boton = (accion: Accion, texto = NOMBRE_ACCION[accion], peligro = false) => (
    <button
      key={accion}
      ref={(b) => {
        botones.current[accion] = b
      }}
      type="button"
      className={`btn ${peligro ? 'btn--danger-text btn--ghost' : 'btn--secondary'} mando__boton`}
      disabled={apagado}
      aria-describedby={apagado ? `${id}-apagado` : undefined}
      onClick={() => pulsar(accion)}
    >
      {texto}
    </button>
  )

  return (
    <div className="stack mando" style={{ '--gap': 'var(--sp-4)' } as CSSProperties}>
      {apagado && (
        <p id={`${id}-apagado`} className="t-small muted mando__apagado">
          El PC está apagado: los botones se activan cuando se encienda.
        </p>
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
        {/* Justo debajo de los botones: no empuja la rejilla al aparecer */}
        {confirmar && (
          <div
            className="confirmar mando__confirmar"
            role="group"
            aria-labelledby={`${id}-confirmar`}
            onKeyDown={(e) => {
              if (e.key === 'Escape') cerrarConfirmar()
            }}
          >
            <span id={`${id}-confirmar`} className="break">
              ¿{NOMBRE_ACCION[confirmar]} «{pc.nombre}»? Si hay algo sin guardar, se perderá.
            </span>
            <button
              type="button"
              className="btn btn--danger"
              disabled={apagado}
              onClick={() => {
                mandar(confirmar)
                cerrarConfirmar()
              }}
            >
              {NOMBRE_ACCION[confirmar]}
            </button>
            <button type="button" ref={botonCancelar} className="btn btn--ghost" onClick={cerrarConfirmar}>
              Cancelar
            </button>
          </div>
        )}
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
            aria-describedby={apagado ? `${id}-apagado` : undefined}
            aria-valuetext={`${volumen} %`}
            // Nunca una orden por cada paso: con el dedo o el ratón se manda al
            // soltar; con teclado o lector de pantalla, al parar 0,6 s (o al salir)
            onPointerDown={(e) => {
              arrastrando.current = true
              // Si se suelta fuera del control, el «soltar» llega igual
              e.currentTarget.setPointerCapture?.(e.pointerId)
            }}
            onChange={(e) => {
              const v = Number(e.target.value)
              setVolumen(v)
              if (!arrastrando.current) mandarVolumenLuego(v)
            }}
            onPointerUp={(e) => {
              arrastrando.current = false
              mandarVolumen(Number(e.currentTarget.value))
            }}
            onPointerCancel={(e) => {
              arrastrando.current = false
              mandarVolumen(Number(e.currentTarget.value))
            }}
            onBlur={(e) => {
              if (espera.current) mandarVolumen(Number(e.currentTarget.value))
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
              <button
                key={app}
                type="button"
                className="btn btn--secondary mando__boton"
                disabled={apagado}
                aria-describedby={apagado ? `${id}-apagado` : undefined}
                onClick={() => mandar('abrir_app', app)}
              >
                {app}
              </button>
            ))}
          </div>
        )}
      </section>

      {ordenes.length > 0 && (
        <section aria-labelledby={`${id}-ultimas`} className="stack" style={{ '--gap': 'var(--sp-1)' } as CSSProperties}>
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
