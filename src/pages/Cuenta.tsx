import { useState, type CSSProperties } from 'react'
import { nombreDeUsuario, useSesion } from '../auth/useSesion'
import { EstadoSincronizacion } from '../components/EstadoSincronizacion'
import { Pagina } from '../components/Pagina'
import { IconoAviso } from '../components/iconos'
import { useEstadoSync } from '../sync/hooks'
import { cerrarSesion as cerrarSesionYBorrarCopia } from '../sync/sesion'

export function Cuenta() {
  const { usuario } = useSesion()
  const { pendientes } = useEstadoSync()
  const [saliendo, setSaliendo] = useState(false)
  // Con cambios sin subir, el primer toque solo avisa; hay que confirmar.
  const [avisado, setAvisado] = useState(false)
  const hayQueConfirmar = pendientes > 0 && !avisado

  async function cerrarSesion() {
    if (hayQueConfirmar) {
      setAvisado(true)
      return
    }
    setSaliendo(true)
    // Nunca falla y no necesita conexión: borra la copia local y la sesión de
    // este dispositivo. AuthProvider recibe SIGNED_OUT y muestra Login.
    await cerrarSesionYBorrarCopia()
  }

  return (
    <Pagina titulo="Cuenta">
      <div className="stack" style={{ maxWidth: 'var(--reading-max)' }}>
        <section className="card stack" aria-labelledby="cuenta-datos" style={{ '--gap': 'var(--sp-3)' } as CSSProperties}>
          <h2 id="cuenta-datos" className="t-section">Tus datos</h2>
          <dl className="stack" style={{ '--gap': 'var(--sp-3)' } as CSSProperties}>
            <div>
              <dt className="t-label">Nombre</dt>
              <dd className="break">{nombreDeUsuario(usuario) || '—'}</dd>
            </div>
            <div>
              <dt className="t-label">Email</dt>
              <dd className="break">{usuario?.email ?? '—'}</dd>
            </div>
            <div>
              <dt className="t-label">Sincronización</dt>
              <dd>
                <EstadoSincronizacion />
              </dd>
            </div>
          </dl>
        </section>

        {avisado && pendientes > 0 && (
          <div className="alert alert--danger" role="alert">
            <IconoAviso />
            <div className="alert__body">
              <p className="alert__title">
                {pendientes === 1 ? 'Tienes 1 cambio sin subir' : `Tienes ${pendientes} cambios sin subir`}
              </p>
              <p>
                Si cierras sesión ahora y no hay conexión, se perderán. Conéctate a internet y espera a que se suban, o
                vuelve a pulsar para cerrar sesión igualmente.
              </p>
            </div>
          </div>
        )}

        <button
          type="button"
          className="btn btn--secondary btn--block"
          onClick={() => void cerrarSesion()}
          disabled={saliendo}
          aria-busy={saliendo || undefined}
        >
          {avisado && pendientes > 0 ? 'Cerrar sesión igualmente' : 'Cerrar sesión'}
        </button>
        <p className="t-small muted">Se borrará la copia de tus datos guardada en este dispositivo. En la nube siguen a salvo.</p>

        <div className="stack" style={{ '--gap': 'var(--sp-2)', marginTop: 'var(--sp-6)' } as CSSProperties}>
          <button type="button" className="btn btn--danger btn--block" disabled aria-describedby="cuenta-borrar-pronto">
            Borrar mi cuenta y todos mis datos
          </button>
          <p id="cuenta-borrar-pronto" className="t-small muted">Disponible pronto.</p>
        </div>
      </div>
    </Pagina>
  )
}
