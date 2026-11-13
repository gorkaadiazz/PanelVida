import { useState, type CSSProperties } from 'react'
import { entrarConGoogle, mensajeDeErrorAuth } from '../lib/auth'
import { IconoAviso, IconoCandado } from '../components/iconos'
import { useEnLinea } from '../components/useEnLinea'
import { useTitulo } from '../components/useTitulo'

interface Props {
  /** Error con el que volvió Google (leerErrorDeVuelta() al arrancar). */
  errorInicial?: string | null
}

export function Login({ errorInicial = null }: Props) {
  useTitulo('Entrar')
  const enLinea = useEnLinea()
  const [entrando, setEntrando] = useState(false)
  const [error, setError] = useState<string | null>(errorInicial)

  async function entrar() {
    setError(null)
    setEntrando(true)
    try {
      await entrarConGoogle() // si va bien, el navegador se va a Google
    } catch (e) {
      setError(mensajeDeErrorAuth(e))
      setEntrando(false)
    }
  }

  return (
    <main className="login">
      <div className="stack" style={{ '--gap': 'var(--sp-3)' } as CSSProperties}>
        <img className="login__marca" src="/icons/icono.svg" alt="" width={56} height={56} />
        <h1 className="t-screen">Mi Panel</h1>
        <p className="muted">Tus hábitos, tareas, dinero y los estudios de 2º SMR en un solo sitio.</p>
      </div>

      <div className="stack">
        {error && (
          <div className="alert alert--danger" role="alert">
            <IconoAviso />
            <div className="alert__body">{error}</div>
          </div>
        )}

        <button
          type="button"
          className="btn btn--primary btn--block"
          onClick={() => void entrar()}
          disabled={!enLinea}
          aria-busy={entrando || undefined}
          aria-describedby={!enLinea ? 'login-sin-conexion' : undefined}
        >
          Continuar con Google
        </button>

        {!enLinea && (
          <p id="login-sin-conexion" className="t-small muted">
            Sin conexión. Para entrar necesitas internet.
          </p>
        )}
      </div>

      <p className="login__privacidad t-small muted">
        <IconoCandado />
        <span>Cada persona ve solo sus datos. Solo pueden entrar los emails autorizados.</span>
      </p>
    </main>
  )
}
