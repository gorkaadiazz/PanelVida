// Edge Function `agentes`: vincular y desvincular el agente del PC.
//
//   POST { accion: 'vincular', codigo, nombre }      (sin sesión: la llama el PC)
//     1. Gasta el código con usar_codigo_vinculacion() (un solo uso, 10 min,
//        tope global de intentos) y obtiene el dueño.
//     2. Crea un USUARIO DE SUPABASE APARTE para el agente, con una
//        contraseña aleatoria y app_metadata.tipo = 'agente' (solo el
//        servidor puede escribir app_metadata).
//     3. Crea su fila en `agentes` y devuelve al PC su email y contraseña.
//        Nada de service role sale de aquí.
//   POST { accion: 'desvincular', agenteId }         (con la sesión del dueño o del propio agente)
//     Borra la fila (deja de funcionar al momento: lo exigen las políticas)
//     y el usuario (sus tokens de refresco mueren).
//
// Se despliega sin verificar el JWT (el PC aún no tiene sesión al vincular):
//   npx supabase functions deploy agentes --no-verify-jwt
// Para desvincular, la función comprueba el JWT ella misma.

import { createClient } from 'npm:@supabase/supabase-js@2'

const DOMINIO_AGENTES = 'agente.invalid'

const responder = (estado: number, datos: unknown) =>
  new Response(JSON.stringify(datos), {
    status: estado,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cors },
  })

// La app (navegador) llama a «desvincular»; el PC no necesita CORS.
// Si cambias de dirección la web, cámbiala aquí (o pon el secreto ORIGENES_APP).
const ORIGENES = (Deno.env.get('ORIGENES_APP') ?? 'https://mypanelvida.netlify.app').split(',').map((o) => o.trim()).filter(Boolean)
const esLocalhost = (o: string) => /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(o)
let cors: Record<string, string> = {}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function limpiarNombre(nombre: unknown): string {
  const texto = typeof nombre === 'string' ? nombre : ''
  const limpio = texto.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim()
  return [...limpio].slice(0, 40).join('') || 'PC'
}

Deno.serve(async (req) => {
  const origen = req.headers.get('origin') ?? ''
  cors = ORIGENES.includes(origen) || esLocalhost(origen)
    ? {
        'access-control-allow-origin': origen,
        'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
        'access-control-allow-methods': 'POST, OPTIONS',
        vary: 'Origin',
      }
    : {}
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return responder(405, { mensaje: 'Método no permitido.' })

  let cuerpo: Record<string, unknown>
  try {
    const texto = await req.text()
    if (texto.length > 2000) return responder(413, { mensaje: 'Demasiado grande.' })
    cuerpo = JSON.parse(texto)
  } catch {
    return responder(400, { mensaje: 'Petición no válida.' })
  }

  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    if (cuerpo.accion === 'vincular') return await vincular(admin, url, cuerpo)
    if (cuerpo.accion === 'desvincular') return await desvincular(admin, req, cuerpo)
    return responder(400, { mensaje: 'Acción desconocida.' })
  } catch (error) {
    // El detalle solo en el registro de la función
    console.error('agentes', error)
    return responder(500, { mensaje: 'No se ha podido completar. Inténtalo otra vez.' })
  }
})

// deno-lint-ignore no-explicit-any
type Admin = any

async function vincular(admin: Admin, url: string, cuerpo: Record<string, unknown>) {
  const codigo = typeof cuerpo.codigo === 'string' ? cuerpo.codigo.slice(0, 20) : ''
  const { data: dueno, error } = await admin.rpc('usar_codigo_vinculacion', { codigo })
  if (error) throw error
  if (!dueno) return responder(403, { mensaje: 'El código no vale: no existe, ya se usó o ha caducado (duran 10 minutos).' })

  const email = `agente-${crypto.randomUUID()}@${DOMINIO_AGENTES}`
  const password = base64url(crypto.getRandomValues(new Uint8Array(32)))
  const nombre = limpiarNombre(cuerpo.nombre)

  // El trigger de emails_permitidos impide crear usuarios que no estén en la
  // lista: se permite este email solo el momento de crearlo (así no se
  // cambia esa función, que comparte la web de exámenes).
  const { error: errorPermitir } = await admin.from('emails_permitidos').insert({ email })
  if (errorPermitir) throw errorPermitir
  let agenteId: string | null = null
  try {
    const { data: creado, error: errorUsuario } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { tipo: 'agente' },
    })
    if (errorUsuario || !creado?.user) throw errorUsuario ?? new Error('Sin usuario')
    agenteId = creado.user.id
  } finally {
    const { error: errorQuitar } = await admin.from('emails_permitidos').delete().eq('email', email)
    // Si falla, lo quita la limpieza de cada hora (agentes_huerfanos)
    if (errorQuitar) console.error('agentes: no se pudo quitar el email permitido', errorQuitar)
  }

  const { error: errorFila } = await admin.from('agentes').insert({ id: agenteId, user_id: dueno, nombre })
  if (errorFila) {
    await admin.auth.admin.deleteUser(agenteId)
    throw errorFila
  }

  return responder(200, {
    agenteId,
    nombre,
    email,
    password,
    supabaseUrl: url,
    anonKey: Deno.env.get('SUPABASE_ANON_KEY'),
  })
}

async function desvincular(admin: Admin, req: Request, cuerpo: Record<string, unknown>) {
  const agenteId = typeof cuerpo.agenteId === 'string' ? cuerpo.agenteId : ''
  if (!/^[0-9a-f-]{36}$/i.test(agenteId)) return responder(400, { mensaje: 'Falta el PC.' })

  // Quién llama: el dueño (desde la app) o el propio agente (al desinstalarlo)
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: quien, error: errorSesion } = await admin.auth.getUser(jwt)
  if (errorSesion || !quien?.user) return responder(401, { mensaje: 'Vuelve a iniciar sesión.' })

  const { data: fila, error } = await admin.from('agentes').select('id, user_id').eq('id', agenteId).maybeSingle()
  if (error) throw error
  // Si la fila ya no existe, solo el propio agente puede pedir que se borre su usuario
  const autorizado = fila ? fila.user_id === quien.user.id || fila.id === quien.user.id : agenteId === quien.user.id
  if (!autorizado) return responder(403, { mensaje: 'Ese PC no es tuyo.' })

  // 1. La fila: desde este momento el agente no ve ni hace nada
  if (fila) {
    const { error: errorBorrar } = await admin.from('agentes').delete().eq('id', agenteId)
    if (errorBorrar) throw errorBorrar
  }
  // 2. El usuario (solo si de verdad es un agente)
  const { data: usuario } = await admin.auth.admin.getUserById(agenteId)
  if (usuario?.user?.app_metadata?.tipo === 'agente') {
    const { error: errorUsuario } = await admin.auth.admin.deleteUser(agenteId)
    if (errorUsuario) console.warn('No se pudo borrar el usuario del agente', errorUsuario)
  }
  return responder(200, { ok: true })
}
