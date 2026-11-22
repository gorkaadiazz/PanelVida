// Edge Function `limpiar-puente`: borra lo del Puente que ha caducado.
//
// La llama SOLO el cron de la base de datos (migración 20261122000100), cada
// hora, con la cabecera x-cron-secret (el mismo secreto de Vault que
// los recordatorios). Se despliega SIN verificación de JWT:
//
//   npx supabase functions deploy limpiar-puente --no-verify-jwt
//
// Orden, para no dejar archivos huérfanos:
//   1. Filas no fijadas con más de 7 días: se borra la FILA (con la condición
//      «sin fijar y caducada» en el mismo delete, así si la fijas justo en ese
//      momento no se toca) y después su archivo de Storage.
//   2. Barrido: archivos del bucket (con 10 min de margen) que no están en ninguna
//      fila se borran. Recoge lo que el paso 1 no pudo borrar, las subidas
//      cortadas y lo borrado en la app sin conexión. La fila manda: un
//      archivo sin fila es basura, nunca al revés.
// Borrar la fila con la service role también la apunta en `borrados`
// (trigger despues_de_borrar), así los dispositivos la quitan de su copia.

import { createClient } from 'npm:@supabase/supabase-js@2'

const BUCKET = 'puente'
const DIAS = 7
/** Filas por tanda (la API de Storage borra hasta 1000 rutas por llamada). */
const TANDA = 200
const MAX_TANDAS = 20

const responder = (estado: number, datos: unknown) =>
  new Response(JSON.stringify(datos), { status: estado, headers: { 'content-type': 'application/json; charset=utf-8' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return responder(405, { mensaje: 'Método no permitido.' })

  // Solo el cron (secreto de Vault). Primero lo barato: sin cabecera, fuera.
  const secreto = req.headers.get('x-cron-secret') ?? ''
  if (secreto.length < 32 || secreto.length > 256) return responder(401, { mensaje: 'No autorizado.' })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: valido, error: errorSecreto } = await admin.rpc('secreto_cron_valido', { secreto })
  if (errorSecreto || valido !== true) return responder(401, { mensaje: 'No autorizado.' })

  let filas = 0
  let archivos = 0
  try {
    // 1. Caducados
    const limite = new Date(Date.now() - DIAS * 24 * 60 * 60 * 1000).toISOString()
    for (let i = 0; i < MAX_TANDAS; i++) {
      const { data, error } = await admin
        .from('puente')
        .select('id, archivo_ruta')
        .eq('fijado', false)
        .lt('created_at', limite)
        .order('created_at')
        .limit(TANDA)
      if (error) throw error
      if (!data?.length) break

      const { data: borradas, error: errorFilas } = await admin
        .from('puente')
        .delete()
        .in('id', data.map((f) => f.id))
        .eq('fijado', false)
        .lt('created_at', limite)
        .select('archivo_ruta')
      if (errorFilas) throw errorFilas
      filas += borradas?.length ?? 0

      const rutas = (borradas ?? []).map((f) => f.archivo_ruta).filter((r): r is string => typeof r === 'string' && r.length > 0)
      if (rutas.length) {
        const { error: errorStorage } = await admin.storage.from(BUCKET).remove(rutas)
        // Si falla, los archivos se quedan sin fila: los recoge el barrido (paso 2) en la próxima hora
        if (errorStorage) console.warn('limpiar-puente: archivos pendientes para el barrido', errorStorage)
        else archivos += rutas.length
      }
      if (data.length < TANDA) break
    }

    // 1b. Filas de archivo cuya subida se cortó hace más de 2 horas (sin archivo).
    //     La función comprueba en el mismo delete que siguen sin archivo.
    {
      const { data, error } = await admin.rpc('puente_borrar_filas_sin_archivo', { limite: TANDA * MAX_TANDAS })
      if (error) throw error
      filas += typeof data === 'number' ? data : 0
    }

    // 2. Huérfanos (la fila manda: un archivo sin fila es basura)
    for (let i = 0; i < MAX_TANDAS; i++) {
      const { data, error } = await admin.rpc('puente_archivos_huerfanos', { limite: TANDA })
      if (error) throw error
      const rutas = ((data ?? []) as unknown[]).filter((r): r is string => typeof r === 'string')
      if (!rutas.length) break
      const { error: errorStorage } = await admin.storage.from(BUCKET).remove(rutas)
      if (errorStorage) throw errorStorage
      archivos += rutas.length
      if (rutas.length < TANDA) break
    }

    return responder(200, { filas, archivos })
  } catch (error) {
    // El detalle solo en el registro de la función, nunca en la respuesta
    console.error('limpiar-puente', error)
    return responder(500, { mensaje: 'La limpieza no ha terminado; se reintentará en la próxima hora.', filas, archivos })
  }
})
