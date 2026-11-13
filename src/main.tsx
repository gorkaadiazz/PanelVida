import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/tokens.css'
import './styles/base.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthProvider'
import { leerErrorDeVuelta } from './lib/auth'

// Una sola vez al arrancar (fuera de React para que StrictMode no lo repita):
// si Google devolvió un error, lo recoge y limpia la URL.
const errorInicial = leerErrorDeVuelta()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App errorInicial={errorInicial} />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
