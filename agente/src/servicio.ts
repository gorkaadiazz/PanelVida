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
import { ACCIONES_SIN_VUELTA, mensajeError, traducir } from './lib/acciones.ts'
import { ejecutar, sesionGrafica, volumenActual } from './mando.ts'
import { escanear } from './red.ts'

export const VERSION = '0.2.0'
const LATIDO_MS = 60_000
const RED_MS = 5 * 60_000

export async function iniciarServicio(): Promise<void> {
  const credenciales = await cargarCredenciales()
  if (!credenciales) {
    console.error('Este PC no está vinculado. Ejecuta: mipanel-agente vincular CODIGO')
    process.exit(0) // sin error: systemd no lo reintenta en bucle
  }
  let config: Awaited<ReturnType<typeof cargarConfig>>
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
    const sonido = await volumenActual()
    const { error: e } = await cliente.rpc('agente_latido', {
      apps,
      version: VERSION,
      volumen: sonido?.volumen ?? null,
      silenciado: sonido?.silenciado ?? null,
    })
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

  // 3. Mando del PC: órdenes de una lista fija, de una en una
  const sesion = await sesionGrafica()
  let cola: Promise<void> = Promise.resolve()
  const procesar = (id: string) => {
    cola = cola.then(() => procesarComando(id)).catch((e: unknown) => console.warn('Mando:', (e as Error).message))
  }
  async function procesarComando(id: string) {
    // Coger la orden: el servidor dice si sigue valiendo (30 s) y solo la da una vez
    const { data, error: e } = await cliente.rpc('agente_tomar_comando', { comando: id })
    if (e) throw e
    const fila = Array.isArray(data) ? data[0] : null
    if (!fila) return
    const orden = traducir(fila.accion, fila.valor, config.apps, sesion)
    const resultado = (ok: boolean, mensaje: string | null) => cliente.rpc('agente_resultado', { comando: id, ok, mensaje })
    if (!orden) {
      await resultado(false, 'Esta acción no está permitida en este PC')
      return
    }
    console.log(`Mando: ${fila.accion}${fila.valor ? ` (${fila.valor})` : ''}`)
    if (ACCIONES_SIN_VUELTA.has(fila.accion)) {
      // Después de apagar ya no se puede contar nada: se cuenta antes
      await resultado(true, 'En marcha')
      try {
        await ejecutar(orden)
      } catch (err) {
        console.warn('Mando:', mensajeError(err))
      }
      return
    }
    try {
      await ejecutar(orden)
      await resultado(true, null)
    } catch (err) {
      await resultado(false, mensajeError(err))
    }
    if (String(fila.accion).startsWith('volumen') || fila.accion === 'silenciar') await latir()
  }
  async function pendientes() {
    const { data, error: e } = await cliente.rpc('agente_comandos_pendientes')
    if (e) return console.warn('Mando:', e.message)
    for (const id of (data ?? []) as string[]) procesar(id)
  }
  const canalMando = cliente
    .channel(`mando-${credenciales.agenteId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comandos', filter: `agente_id=eq.${credenciales.agenteId}` }, (cambio) => {
      const id = (cambio.new as { id?: unknown }).id
      if (typeof id === 'string') procesar(id)
    })
    .subscribe((estado) => {
      // Al conectar (o reconectar) se miran las que hubiera; las viejas el servidor las da por caducadas
      if (estado === 'SUBSCRIBED') void pendientes()
    })

  // 4. Vigilante de la red: cada 5 minutos, solo en casa
  if (!config.macRouter) console.log('Red: sin macRouter en config.json, no se escanea (mira: mipanel-agente red).')
  let escaneando = false
  async function vigilarRed() {
    if (escaneando || !config.macRouter) return
    escaneando = true
    try {
      const escaneo = await escanear(config.macRouter)
      if (!escaneo) return // fuera de casa
      const { data: sinAvisar, error: e } = await cliente.rpc('agente_red', { dispositivos: escaneo.dispositivos })
      if (e) return console.warn('Red:', e.message)
      if (typeof sinAvisar === 'number' && sinAvisar > 0) {
        const { data: sesionActual } = await cliente.auth.getSession()
        const r = await fetch(`${credenciales!.supabaseUrl}/functions/v1/aviso-red`, {
          method: 'POST',
          headers: { authorization: `Bearer ${sesionActual.session?.access_token ?? ''}`, apikey: credenciales!.anonKey },
        })
        if (!r.ok) console.warn('Red: no se ha podido avisar', r.status)
      }
    } catch (err) {
      console.warn('Red:', (err as Error).message)
    } finally {
      escaneando = false
    }
  }
  const primerEscaneo = setTimeout(() => void vigilarRed(), 30_000)
  const temporizadorRed = setInterval(() => void vigilarRed(), RED_MS)

  // Parada limpia (systemctl --user stop)
  const parar = async () => {
    clearInterval(temporizador)
    clearTimeout(primerEscaneo)
    clearInterval(temporizadorRed)
    await cliente.removeChannel(canal)
    await cliente.removeChannel(canalMando)
    await cliente.auth.signOut()
    process.exit(0)
  }
  process.on('SIGTERM', () => void parar())
  process.on('SIGINT', () => void parar())
}
