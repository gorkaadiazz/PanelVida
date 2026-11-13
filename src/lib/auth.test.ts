import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// El cliente real exige variables de entorno; aquí no hace falta.
vi.mock('./supabase', () => ({ supabase: { auth: {} } }))

import { leerErrorDeVuelta, mensajeDeErrorAuth } from './auth'

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
