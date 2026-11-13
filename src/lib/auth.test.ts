import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// El cliente real exige variables de entorno; aquí no hace falta.
vi.mock('./supabase', () => ({ supabase: { auth: { admin: {} } }, CLAVE_SESION: 'sb-prueba-auth-token' }))

import { ESPERA_CIERRE_MS, leerErrorDeVuelta, mensajeDeErrorAuth, salir, sesionGuardada } from './auth'
import { supabase } from './supabase'

const SIN_ACCESO = 'Este email no tiene acceso a la app. Pide que lo añadan a la lista.'
const GENERICO = 'No se ha podido iniciar sesión. Inténtalo de nuevo.'

describe('mensajeDeErrorAuth', () => {
  it('reconoce el email no permitido envuelto por Supabase Auth', () => {
    expect(mensajeDeErrorAuth({ message: 'Database error saving new user' })).toBe(SIN_ACCESO)
    expect(mensajeDeErrorAuth({ message: 'DATABASE ERROR SAVING NEW USER' })).toBe(SIN_ACCESO)
  })

  it('reconoce el mensaje del trigger', () => {
    expect(mensajeDeErrorAuth({ message: 'Este email no tiene acceso a la app' })).toBe(SIN_ACCESO)
  })

  it('reconoce el caso también en el code', () => {
    expect(mensajeDeErrorAuth({ message: 'x', code: 'database error saving new user' })).toBe(SIN_ACCESO)
  })

  it('otros errores dan el mensaje genérico y nunca el texto interno', () => {
    const msg = mensajeDeErrorAuth({ message: 'relation "secreta" does not exist', code: 'unexpected_failure' })
    expect(msg).toBe(GENERICO)
    expect(mensajeDeErrorAuth(new Error('Network request failed'))).toBe(GENERICO)
  })

  it('tolera null, undefined, cadenas y objetos raros', () => {
    expect(mensajeDeErrorAuth(null)).toBe(GENERICO)
    expect(mensajeDeErrorAuth(undefined)).toBe(GENERICO)
    // Una cadena suelta no se interpreta: solo error.message/code.
    expect(mensajeDeErrorAuth('Database error saving new user')).toBe(GENERICO)
    expect(mensajeDeErrorAuth({ message: 42, code: {} })).toBe(GENERICO)
    expect(mensajeDeErrorAuth({})).toBe(GENERICO)
  })
})

describe('leerErrorDeVuelta', () => {
  let replaceState: ReturnType<typeof vi.fn>

  function ponerUrl(url: string) {
    const u = new URL(url)
    vi.stubGlobal('location', { origin: u.origin, pathname: u.pathname, search: u.search, hash: u.hash })
    replaceState = vi.fn()
    vi.stubGlobal('history', { state: { idx: 3 }, replaceState })
  }

  beforeEach(() => ponerUrl('https://panel.test/'))
  afterEach(() => vi.unstubAllGlobals())

  it('sin error devuelve null y no toca la URL', () => {
    ponerUrl('https://panel.test/tareas?filtro=hoy#seccion')
    expect(leerErrorDeVuelta()).toBeNull()
    expect(replaceState).not.toHaveBeenCalled()
  })

  it('no toca el ?code= de un login correcto', () => {
    ponerUrl('https://panel.test/?code=abc123')
    expect(leerErrorDeVuelta()).toBeNull()
    expect(replaceState).not.toHaveBeenCalled()
  })

  it('lee el error de la query y limpia solo los parámetros de error', () => {
    ponerUrl(
      'https://panel.test/?error=server_error&error_code=unexpected_failure&error_description=Database+error+saving+new+user&otro=1',
    )
    expect(leerErrorDeVuelta()).toBe(SIN_ACCESO)
    expect(replaceState).toHaveBeenCalledTimes(1)
    expect(replaceState).toHaveBeenCalledWith({ idx: 3 }, '', '/?otro=1')
  })

  it('lee el error del hash y quita el hash entero', () => {
    ponerUrl('https://panel.test/#error=access_denied&error_code=x&error_description=Este%20email%20no%20tiene%20acceso')
    expect(leerErrorDeVuelta()).toBe(SIN_ACCESO)
    expect(replaceState).toHaveBeenCalledWith({ idx: 3 }, '', '/')
  })

  it('acepta el hash con "#/" delante', () => {
    ponerUrl('https://panel.test/#/error=access_denied&error_description=otra+cosa')
    expect(leerErrorDeVuelta()).toBe(GENERICO)
    expect(replaceState).toHaveBeenCalledWith({ idx: 3 }, '', '/')
  })

  it('con error solo en la query conserva el hash', () => {
    ponerUrl('https://panel.test/cuenta?error=access_denied#arriba')
    expect(leerErrorDeVuelta()).toBe(GENERICO)
    expect(replaceState).toHaveBeenCalledWith({ idx: 3 }, '', '/cuenta#arriba')
  })

  it('basta con error_description aunque no venga error', () => {
    ponerUrl('https://panel.test/?error_description=algo')
    expect(leerErrorDeVuelta()).toBe(GENERICO)
    expect(replaceState).toHaveBeenCalledWith({ idx: 3 }, '', '/')
  })

  it('nunca devuelve tal cual el texto de error_description', () => {
    const malicioso = '<img src=x onerror=alert(1)> Llama al 600 000 000 para recuperar tu cuenta'
    ponerUrl(`https://panel.test/?error=x&error_description=${encodeURIComponent(malicioso)}`)
    const msg = leerErrorDeVuelta()
    expect(msg).toBe(GENERICO)
    expect(msg).not.toContain('onerror')
    expect(msg).not.toContain('600')
  })

  it('aunque el texto malicioso mencione el acceso, solo devuelve el mensaje fijo', () => {
    const malicioso = 'no tiene acceso. Escribe tu contraseña en evil.example'
    ponerUrl(`https://panel.test/#error=x&error_description=${encodeURIComponent(malicioso)}`)
    const msg = leerErrorDeVuelta()
    expect(msg).toBe(SIN_ACCESO)
    expect(msg).not.toContain('evil')
  })
})

describe('salir (cerrar sesión en este dispositivo)', () => {
  const CLAVE = 'sb-prueba-auth-token'
  const SESION = JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_at: 1, user: { id: 'u1' } })
  let guardado: Map<string, string>
  let replace: ReturnType<typeof vi.fn>
  let enLinea: boolean
  const auth = supabase.auth as unknown as {
    signOut?: (opciones: { scope: string }) => Promise<{ error: unknown }>
    admin: { signOut?: (token: string, scope: string) => Promise<{ error: unknown }> }
  }
  const adminOriginal = auth.admin.signOut

  beforeEach(() => {
    guardado = new Map([[CLAVE, SESION]])
    replace = vi.fn()
    enLinea = true
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => guardado.get(k) ?? null,
      removeItem: (k: string) => void guardado.delete(k),
    })
    vi.stubGlobal('location', { replace })
    vi.stubGlobal('navigator', {
      get onLine() {
        return enLinea
      },
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    auth.admin.signOut = vi.fn(async () => ({ error: null }))
  })

  afterEach(() => {
    delete auth.signOut
    auth.admin.signOut = adminOriginal
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('borra la sesión guardada ANTES de llamar a signOut, que cierra solo este dispositivo', async () => {
    let habiaSesionAlLlamar: boolean | null = null
    const signOut = vi.fn(async () => {
      habiaSesionAlLlamar = guardado.has(CLAVE)
      return { error: null }
    })
    auth.signOut = signOut
    await salir()
    expect(habiaSesionAlLlamar).toBe(false)
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(sesionGuardada()).toBeNull()
    expect(replace).not.toHaveBeenCalled()
  })

  it('con red, anula en el servidor el token que había guardado', async () => {
    auth.signOut = async () => ({ error: null })
    await salir()
    expect(auth.admin.signOut).toHaveBeenCalledWith('a', 'local')
  })

  it('sin red no intenta anular el token en el servidor', async () => {
    enLinea = false
    auth.signOut = async () => ({ error: new TypeError('Failed to fetch') })
    await expect(salir()).resolves.toBeUndefined()
    expect(sesionGuardada()).toBeNull()
    expect(auth.admin.signOut).not.toHaveBeenCalled()
  })

  it('token caducado y sin red: aunque signOut no responda nunca, la sesión se borra al momento y salir() termina', async () => {
    vi.useFakeTimers()
    enLinea = false
    guardado.set(`${CLAVE}-code-verifier`, 'x')
    auth.signOut = () => new Promise(() => {}) // supabase-js reintentando renovar el token
    const terminado = salir()
    // Antes de que pase ningún tiempo, ya no queda nada en localStorage
    expect([...guardado.keys()]).toEqual([])
    await vi.advanceTimersByTimeAsync(ESPERA_CIERRE_MS)
    await expect(terminado).resolves.toBeUndefined()
  })

  it('tampoco se queda colgado si el servidor no contesta al anular el token', async () => {
    vi.useFakeTimers()
    auth.signOut = async () => ({ error: null })
    auth.admin.signOut = () => new Promise(() => {})
    const terminado = salir()
    await vi.advanceTimersByTimeAsync(2 * ESPERA_CIERRE_MS)
    await expect(terminado).resolves.toBeUndefined()
    expect(sesionGuardada()).toBeNull()
  })

  it('si signOut lanza, la sesión ya está borrada igualmente', async () => {
    auth.signOut = async () => {
      throw new Error('roto')
    }
    await expect(salir()).resolves.toBeUndefined()
    expect(sesionGuardada()).toBeNull()
  })

  it('respaldo: si algo vuelve a guardar la sesión mientras se cierra, se borra y se recarga', async () => {
    auth.signOut = async () => {
      guardado.set(CLAVE, SESION) // p. ej. otra pestaña que acaba de renovar el token
      return { error: null }
    }
    await salir()
    expect(sesionGuardada()).toBeNull()
    expect(replace).toHaveBeenCalledWith('/')
  })

  it('sesionGuardada lee la sesión del dispositivo sin pasar por la red', () => {
    expect(sesionGuardada()?.user.id).toBe('u1')
    guardado.clear()
    expect(sesionGuardada()).toBeNull()
  })
})
