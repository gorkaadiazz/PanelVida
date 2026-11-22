// Edge Function `aviso-red`: avisa (Web Push, como los recordatorios) de los
// aparatos que aparecen por primera vez en tu red de casa.
//
// La llama el agente del PC, con SU sesión, después de un escaneo con algo
// nuevo. Comprueba que quien llama es un agente vinculado, reserva los
// aparatos sin avisar de su dueño (red_reservar_avisos: cada uno se avisa una
// sola vez aunque lleguen dos llamadas a la vez) y manda la notificación a
// los dispositivos donde el dueño activó los recordatorios.
//
//   npx supabase functions deploy aviso-red --no-verify-jwt
// (el JWT se comprueba aquí dentro, igual que en `agentes`)
// Usa los secretos VAPID_* de los recordatorios.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { enviar, type ClavesVapid } from '../_shared/webpush.ts'

const responder = (estado: number, datos: unknown) =>
  new Response(JSON.stringify(datos), { status: estado, headers: { 'content-type': 'application/json; charset=utf-8' } })

/** «Un aparato nuevo: Samsung (192.168.1.34)» o «3 aparatos nuevos en tu red». */
function texto(nuevos: { mac: string; ip: string | null; fabricante: string | null; aleatoria: boolean }[]) {
  if (nuevos.length === 1) {
    const n = nuevos[0]
    const quien = n.fabricante ?? (n.aleatoria ? 'un móvil o similar (MAC privada)' : n.mac)
    return { titulo: 'Aparato nuevo en tu red', cuerpo: `${quien}${n.ip ? ` (${n.ip})` : ''}. Míralo en Mi Panel → Red.` }
  }
  return { titulo: 'Aparatos nuevos en tu red', cuerpo: `${nuevos.length} aparatos que no se habían visto nunca. Míralos en Mi Panel → Red.` }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return responder(405, { mensaje: 'Método no permitido.' })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // 1. Solo un agente vinculado (su propio token)
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: quien, error: errorSesion } = await admin.auth.getUser(jwt)
  if (errorSesion || !quien?.user) return responder(401, { mensaje: 'No autorizado.' })
  const { data: agente } = await admin.from('agentes').select('user_id').eq('id', quien.user.id).maybeSingle()
  if (!agente) return responder(403, { mensaje: 'No es un agente vinculado.' })

  const vapid: ClavesVapid = {
    publica: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
    privada: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
    sujeto: Deno.env.get('VAPID_SUBJECT') ?? '',
  }
  if (!vapid.publica || !vapid.privada || !/^(mailto:|https:\/\/)/.test(vapid.sujeto)) {
    console.error('Faltan los secretos VAPID_*')
    return responder(500, { mensaje: 'Avisos sin configurar.' })
  }

  try {
    // 2. Reservar los nuevos (quedan marcados como avisados)
    const { data: nuevos, error } = await admin.rpc('red_reservar_avisos', { dueno: agente.user_id })
    if (error) throw error
    if (!nuevos?.length) return responder(200, { avisados: 0 })

    // 3. A los dispositivos del dueño con los avisos activados (como mucho 10)
    const { data: suscripciones, error: errorSus } = await admin
      .from('suscripciones_push')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', agente.user_id)
      .limit(10)
    if (errorSus) throw errorSus
    const mensaje = { ...texto(nuevos), tipo: 'red' }
    let enviados = 0
    await Promise.all(
      (suscripciones ?? []).map(async (s) => {
        try {
          const r = await enviar(s, mensaje, vapid)
          if (r === 'enviado') enviados++
          else if (r === 'caducada') await admin.from('suscripciones_push').delete().eq('id', s.id)
        } catch {
          console.warn('No se ha podido enviar un aviso de la red')
        }
      }),
    )
    return responder(200, { avisados: nuevos.length, enviados })
  } catch (e) {
    console.error('aviso-red', e)
    return responder(500, { mensaje: 'No se ha podido avisar.' })
  }
})
