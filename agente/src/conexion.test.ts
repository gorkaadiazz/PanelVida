// conexion.ts sin red: solo «invalid_credentials» significa desvinculado; el
// resto de errores (p. ej. el proveedor Email desactivado, sin red) se relanza
// para que systemd lo reintente.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  error: null as null | { status?: number; code?: string; message: string },
  opciones: null as unknown,
  url: '',
  clave: '',
  login: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: (url: string, clave: string, opciones: unknown) => {
    m.url = url
    m.clave = clave
    m.opciones = opciones
    return {
      auth: {
        signInWithPassword: async (datos: unknown) => {
          m.login(datos)
          return { data: null, error: m.error }
        },
      },
    }
  },
}))

const { conectar, Desvinculado } = await import('./conexion.ts')

const cred = {
  supabaseUrl: 'https://abc.supabase.co',
  anonKey: 'anon',
  email: 'agente-1@agente.invalid',
  password: 'x'.repeat(43),
  agenteId: '11111111-1111-4111-8111-111111111111',
  nombre: 'PC casa',
}

beforeEach(() => {
  m.error = null
  m.login.mockClear()
})

describe('conectar', () => {
  it('entra con el email y la contraseña del agente, con la clave anon y sin guardar sesión', async () => {
    await expect(conectar(cred)).resolves.toBeDefined()
    expect(m.url).toBe(cred.supabaseUrl)
    expect(m.clave).toBe('anon')
    expect(m.login).toHaveBeenCalledWith({ email: cred.email, password: cred.password })
    expect((m.opciones as { auth: { persistSession: boolean } }).auth.persistSession).toBe(false)
  })

  it('invalid_credentials (usuario borrado al desvincular): Desvinculado', async () => {
    m.error = { status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' }
    await expect(conectar(cred)).rejects.toBeInstanceOf(Desvinculado)
  })

  it('otro 400 (p. ej. proveedor Email desactivado) NO es desvinculado: se relanza tal cual', async () => {
    m.error = { status: 400, code: 'email_provider_disabled', message: 'Email logins are disabled' }
    const e = await conectar(cred).catch((x: unknown) => x)
    expect(e).not.toBeInstanceOf(Desvinculado)
    expect(e).toBe(m.error)
  })

  it('un mensaje que dice «invalid login» pero sin el código tampoco cuenta como desvinculado', async () => {
    m.error = { status: 400, message: 'Invalid login credentials' }
    await expect(conectar(cred)).rejects.not.toBeInstanceOf(Desvinculado)
  })

  it('sin red (500 o fetch failed): se relanza', async () => {
    m.error = { status: 500, message: 'fetch failed' }
    await expect(conectar(cred)).rejects.not.toBeInstanceOf(Desvinculado)
  })
})
