import { useState, type CSSProperties } from 'react'
import { nombreDeUsuario, useSesion } from '../auth/useSesion'
import { Pagina } from '../components/Pagina'
import { IconoAviso } from '../components/iconos'
import { salir } from '../lib/auth'
import { limpiarDatosLocales } from '../lib/limpieza'

export function Cuenta() {
  const { usuario } = useSesion()
  const [saliendo, setSaliendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function cerrarSesion() {
    setError(null)
    setSaliendo(true)
    try {
      await salir()
      await limpiarDatosLocales()
      // Al cerrar sesión, AuthProvider recibe SIGNED_OUT y se muestra Login.
    } catch {
      setError('No se ha podido cerrar la sesión. Inténtalo de nuevo.')
      setSaliendo(false)
    }
  }

  return (
    <Pagina titulo="Cuenta">
      <div className="stack" style={{ maxWidth: 'var(--reading-max)' }}>
        <section className="card stack" aria-labelledby="cuenta-datos" style={{ '--gap': 'var(--sp-3)' } as CSSProperties}>
          <h2 id="cuenta-datos" className="t-section">Tus datos</h2>
          <dl className="stack" style={{ '--gap': 'var(--sp-3)' } as CSSProperties}>
            <div>
              <dt className="t-label">Nombre</dt>
              <dd>{nombreDeUsuario(usuario) || '—'}</dd>
            </div>
            <div>
              <dt className="t-label">Email</dt>
              <dd className="truncate">{usuario?.email ?? '—'}</dd>
            </div>
          </dl>
        </section>

        {error && (
          <div className="alert alert--danger" role="alert">
            <IconoAviso />
            <div className="alert__body">{error}</div>
          </div>
        )}

        <button
          type="button"
          className="btn btn--secondary btn--block"
          onClick={() => void cerrarSesion()}
          aria-busy={saliendo || undefined}
        >
          Cerrar sesión
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
