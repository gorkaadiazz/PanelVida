// Edge Function `recordatorios`: envía el aviso del día (Web Push) a las
// suscripciones cuya hora (de Madrid) es la de ahora.
//
// La llama SOLO el cron de la base de datos (migración 20261114000200), cada
// hora, con la cabecera x-cron-secret. Se despliega SIN verificación de JWT
// (el cron no tiene sesión): la protección es ese secreto, que se comprueba
// contra Vault con secreto_cron_valido() (solo la service role puede).
//
//   npx supabase functions deploy recordatorios --no-verify-jwt
//
// Secretos (npx supabase secrets set --env-file supabase/functions/.env):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { contarPendientes, diaSiguiente, enMadrid, textoRecordatorio } from '../_shared/recordatorio.ts'
import { enviar, type ClavesVapid } from '../_shared/webpush.ts'

const responder = (estado: number, datos: unknown) =>
  new Response(JSON.stringify(datos), { status: estado, headers: { 'content-type': 'application/json; charset=utf-8' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return responder(405, { mensaje: 'Método no permitido.' })

  const vapid: ClavesVapid = {
    publica: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
    privada: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
    sujeto: Deno.env.get('VAPID_SUBJECT') ?? '',
  }
  if (!vapid.publica || !vapid.privada || !/^(mailto:|https:\/\/)/.test(vapid.sujeto)) {
    console.error('Faltan los secretos VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY o VAPID_SUBJECT')
    return responder(500, { mensaje: 'Recordatorios sin configurar.' })
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // 1. Solo el cron (secreto de Vault)
  const { data: valido, error: errorSecreto } = await admin.rpc('secreto_cron_valido', { secreto: req.headers.get('x-cron-secret') ?? '' })
  if (errorSecreto || valido !== true) return responder(401, { mensaje: 'No autorizado.' })

  try {
    const { dia, hora } = enMadrid(Date.now())
    const manana = diaSiguiente(dia)

    // 2. Suscripciones de esta hora a las que aún no se ha enviado hoy
    const { data: suscripciones, error } = await admin
      .from('suscripciones_push')
      .select('id, user_id, endpoint, p256dh, auth')
      .eq('hora', hora)
      .or(`ultimo_envio.is.null,ultimo_envio.lt.${dia}`)
    if (error) throw error

    const porUsuario = new Map<string, typeof suscripciones>()
    for (const s of suscripciones ?? []) porUsuario.set(s.user_id, [...(porUsuario.get(s.user_id) ?? []), s])

    let enviados = 0
    for (const [usuario, suyas] of porUsuario) {
      // 3. Se «reserva» cada suscripción para hoy ANTES de enviar: si el cron
      //    se solapara consigo mismo, la otra llamada ya no la encuentra.
      const { data: reservadas } = await admin
        .from('suscripciones_push')
        .update({ ultimo_envio: dia })
        .in('id', suyas.map((s) => s.id))
        .or(`ultimo_envio.is.null,ultimo_envio.lt.${dia}`)
        .select('id')
      const ids = new Set((reservadas ?? []).map((r) => r.id))
      if (ids.size === 0) continue

      // 4. Lo pendiente del usuario (siempre filtrando por SU user_id)
      const [habitos, marcas, tareas, evaluaciones] = await Promise.all([
        admin.from('habitos').select('id, archivado').eq('user_id', usuario),
        admin.from('habito_marcas').select('habito_id, fecha, hecho').eq('user_id', usuario).eq('fecha', dia),
        admin.from('tareas').select('hecha, fecha_limite').eq('user_id', usuario).eq('hecha', false).lte('fecha_limite', manana),
        admin
          .from('evaluaciones')
          .select('tipo, estado, fecha')
          .eq('user_id', usuario)
          .gte('fecha', `${dia}T00:00:00Z`)
          .lte('fecha', `${diaSiguiente(manana)}T23:59:59Z`),
      ])
      const fallo = habitos.error ?? marcas.error ?? tareas.error ?? evaluaciones.error
      if (fallo) throw fallo

      const texto = textoRecordatorio(
        contarPendientes({ habitos: habitos.data ?? [], marcas: marcas.data ?? [], tareas: tareas.data ?? [], evaluaciones: evaluaciones.data ?? [] }, dia),
      )
      if (!texto) continue

      // 5. Envío a cada dispositivo; las suscripciones caducadas se borran
      for (const s of suyas.filter((s) => ids.has(s.id))) {
        try {
          const resultado = await enviar(s, { titulo: texto.titulo, cuerpo: texto.cuerpo, url: '/' }, vapid)
          if (resultado === 'enviado') enviados++
          else if (resultado === 'caducada') await admin.from('suscripciones_push').delete().eq('id', s.id)
          else console.warn('El servicio de notificaciones ha rechazado un envío')
        } catch {
          console.warn('No se ha podido enviar una notificación')
        }
      }
    }
    return responder(200, { usuarios: porUsuario.size, enviados })
  } catch (error) {
    // El detalle solo en los registros de Supabase, nunca en la respuesta
    console.error('Fallo en recordatorios', error)
    return responder(500, { mensaje: 'No se han podido enviar los recordatorios.' })
  }
})
