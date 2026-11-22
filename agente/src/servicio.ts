// Agente del PC · el servicio que corre siempre (systemd --user).
//   · Latido cada minuto: la app enseña «Encendido» o «Apagado (visto hace X)».
//   · Puente en tiempo real: avisa de lo que llega y copia texto y enlaces.
// Si se corta la conexión, supabase-js reconecta solo; si las credenciales
// dejan de valer (desvinculado), el servicio se para.

import type { SupabaseClient } from '@supabase/supabase-js'
import { cargarConfig, cargarCredenciales } from './archivos.ts'
import { conectar, Desvinculado } from './conexion.ts'
import { copiar, notificar } from './escritorio.ts'
import { reaccionar, type ElementoPuente } from './lib/puente.ts'

export const VERSION = '0.1.0'
const LATIDO_MS = 60_000

export async function iniciarServicio(): Promise<void> {
  const credenciales = await cargarCredenciales()
  if (!credenciales) {
    console.error('Este PC no está vinculado. Ejecuta: mipanel-agente vincular CODIGO')
    process.exit(0) // sin error: systemd no lo reintenta en bucle
  }
  let config
  try {
    config = await cargarConfig()
  } catch (e) {
    // Un config.json roto no se arregla reintentando: se avisa y se para
    console.error((e as Error).message)
    await notificar('Mi Panel', 'El archivo ~/.config/mipanel/config.json no es válido. Corrígelo y reinicia el agente.')
    process.exit(0)
  }
  let cliente: SupabaseClient
  try {
    cliente = await conectar(credenciales)
  } catch (e) {
    if (e instanceof Desvinculado) {
      console.error(e.message, 'Vuelve a vincularlo desde la app (Mando del PC → Vincular un PC).')
      await notificar('Mi Panel', 'Este PC ya no está vinculado. Vuelve a vincularlo desde la app.')
      process.exit(0)
    }
    throw e // red u otro fallo: systemd lo reintenta (Restart=on-failure)
  }

  // De quién es este agente (para escuchar su Puente)
  const { data: yo, error } = await cliente.from('agentes').select('user_id, nombre').eq('id', credenciales.agenteId).maybeSingle()
  if (error) throw error
  if (!yo) {
    console.error('Este PC ya no está vinculado.')
    process.exit(0)
  }
  const nombre = yo.nombre as string
  console.log(`Mi Panel: agente de «${nombre}» en marcha (versión ${VERSION}).`)

  // 1. Latido
  const apps = config.apps.map((a) => a.nombre)
  async function latir() {
    const { error: e } = await cliente.rpc('agente_latido', { apps, version: VERSION })
    if (e) {
      console.warn('Latido:', e.message)
      if (e.code === '42501') {
        console.error('Este PC se ha desvinculado desde la app. El agente se para.')
        await notificar('Mi Panel', 'Este PC se ha desvinculado. El agente se ha parado.')
        process.exit(0)
      }
    }
  }
  await latir()
  const temporizador = setInterval(() => void latir(), LATIDO_MS)

  // 2. Puente: lo nuevo de su dueño
  const canal = cliente
    .channel(`agente-${credenciales.agenteId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'puente', filter: `user_id=eq.${yo.user_id}` }, (cambio) => {
      const fila = cambio.new as Partial<ElementoPuente>
      if (typeof fila.tipo !== 'string' || typeof fila.contenido !== 'string') return
      const r = reaccionar(
        {
          id: String(fila.id),
          tipo: fila.tipo,
          contenido: fila.contenido,
          archivo_nombre: fila.archivo_nombre ?? null,
          dispositivo: String(fila.dispositivo ?? ''),
          origen_agente: fila.origen_agente ?? null,
        },
        nombre,
      )
      void (async () => {
        if (r.copiar !== null) await copiar(r.copiar)
        if (r.aviso) await notificar(r.aviso.titulo, r.aviso.cuerpo)
      })()
    })
    .subscribe((estado) => {
      if (estado === 'SUBSCRIBED') console.log('Escuchando el Puente.')
      else if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT') console.warn('Tiempo real:', estado, '(se reintenta solo)')
    })

  // Parada limpia (systemctl --user stop)
  const parar = async () => {
    clearInterval(temporizador)
    await cliente.removeChannel(canal)
    await cliente.auth.signOut()
    process.exit(0)
  }
  process.on('SIGTERM', () => void parar())
  process.on('SIGINT', () => void parar())
}
