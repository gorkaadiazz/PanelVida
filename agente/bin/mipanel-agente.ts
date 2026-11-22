#!/usr/bin/env node
// Agente del PC de Mi Panel. Uso:
//   mipanel-agente vincular CODIGO [nombre del PC]   vincula este PC (código de la app, 10 min)
//   mipanel-agente iniciar                           el servicio (lo arranca systemd)
//   mipanel-agente enviar                            manda el portapapeles al Puente (mipanel-enviar)
//   mipanel-agente estado                            dice si está vinculado y la configuración
//   mipanel-agente red                               la MAC de tu router (para macRouter en config.json)
//   mipanel-agente desvincular                       desvincula este PC y borra sus credenciales

import { execFile } from 'node:child_process'
import { hostname } from 'node:os'
import { promisify } from 'node:util'
import { ARCHIVO_CONFIG, ARCHIVO_CREDENCIALES, borrarCredenciales, cargarConfig, cargarCredenciales, guardarCredenciales } from '../src/archivos.ts'
import { conectar } from '../src/conexion.ts'
import { leerPortapapeles, notificar } from '../src/escritorio.ts'
import { leerCredenciales, normalizarCodigoVincular } from '../src/lib/config.ts'
import { prepararEnvio } from '../src/lib/puente.ts'
import { iniciarServicio } from '../src/servicio.ts'
import { routerActual } from '../src/red.ts'

const ejecutar = promisify(execFile)
const [orden, ...args] = process.argv.slice(2)

async function reiniciarServicio() {
  try {
    await ejecutar('systemctl', ['--user', 'restart', 'mipanel-agente.service'], { timeout: 10_000 })
    console.log('Servicio reiniciado.')
  } catch {
    console.log('Arranca el servicio con: systemctl --user restart mipanel-agente')
  }
}

async function vincular() {
  const codigo = normalizarCodigoVincular(args[0] ?? '')
  if (!codigo) {
    console.error('Escribe el código que te da la app: mipanel-agente vincular ABCD-EFGH')
    process.exit(2)
  }
  const nombre = args.slice(1).join(' ').trim() || hostname()
  const { supabaseUrl } = await cargarConfig()
  const respuesta = await fetch(`${supabaseUrl}/functions/v1/agentes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accion: 'vincular', codigo, nombre }),
  })
  const datos = (await respuesta.json().catch(() => ({}))) as Record<string, unknown>
  if (!respuesta.ok) {
    console.error(typeof datos.mensaje === 'string' ? datos.mensaje : `Error ${respuesta.status}`)
    process.exit(1)
  }
  const credenciales = leerCredenciales(datos)
  if (!credenciales) {
    console.error('La respuesta del servidor no es la esperada.')
    process.exit(1)
  }
  await guardarCredenciales(credenciales)
  console.log(`Vinculado como «${credenciales.nombre}». Credenciales en ${ARCHIVO_CREDENCIALES} (solo tú puedes leerlas).`)
  await reiniciarServicio()
}

async function enviar() {
  const credenciales = await cargarCredenciales()
  if (!credenciales) {
    await notificar('Mi Panel', 'Este PC no está vinculado.')
    process.exit(1)
  }
  const texto = prepararEnvio((await leerPortapapeles()) ?? '')
  if (!texto) {
    await notificar('Mi Panel', 'El portapapeles está vacío o es demasiado largo (máximo 10.000 caracteres).')
    process.exit(1)
  }
  const cliente = await conectar(credenciales)
  const { error } = await cliente.rpc('agente_enviar_puente', { contenido: texto })
  await cliente.auth.signOut()
  if (error) {
    console.error(error.message)
    await notificar('Mi Panel', 'No se ha podido mandar al Puente.')
    process.exit(1)
  }
  await notificar('Mi Panel', 'Mandado al Puente.')
}

async function estado() {
  const credenciales = await cargarCredenciales()
  const config = await cargarConfig()
  console.log(credenciales ? `Vinculado como «${credenciales.nombre}».` : 'No vinculado.')
  console.log(`Configuración: ${ARCHIVO_CONFIG}`)
  console.log(`Apps que se pueden abrir: ${config.apps.map((a) => a.nombre).join(', ') || '(ninguna)'}`)
  console.log(`Router de casa: ${config.macRouter ?? '(sin configurar)'}`)
}

async function red() {
  const config = await cargarConfig()
  const router = await routerActual()
  if (!router) {
    console.log('No hay conexión a ninguna red ahora mismo.')
    return
  }
  console.log(`Router (puerta de enlace): ${router.ip} por ${router.dev}`)
  console.log(`MAC del router: ${router.mac ?? '(no se ha podido leer)'}`)
  if (router.mac && config.macRouter === router.mac) console.log('Es tu red de casa: el vigilante escanea aquí.')
  else if (router.mac) console.log(`Si es tu red de casa, pon en ${ARCHIVO_CONFIG}:\n  "macRouter": "${router.mac}"\ny reinicia: systemctl --user restart mipanel-agente`)
}

async function desvincular() {
  const credenciales = await cargarCredenciales()
  if (!credenciales) {
    console.log('Este PC no estaba vinculado.')
    return
  }
  try {
    const cliente = await conectar(credenciales)
    const { data } = await cliente.auth.getSession()
    await fetch(`${credenciales.supabaseUrl}/functions/v1/agentes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
      body: JSON.stringify({ accion: 'desvincular', agenteId: credenciales.agenteId }),
    })
  } catch (e) {
    console.warn('No se ha podido avisar al servidor (desvincúlalo también desde la app):', (e as Error).message)
  }
  await borrarCredenciales()
  try {
    await ejecutar('systemctl', ['--user', 'stop', 'mipanel-agente.service'], { timeout: 10_000 })
  } catch {
    // no estaba en marcha
  }
  console.log('Desvinculado. Credenciales borradas.')
}

const ordenes: Record<string, () => Promise<void>> = { vincular, iniciar: iniciarServicio, enviar, estado, red, desvincular }
const elegida = ordenes[orden ?? '']
if (!elegida || !Object.hasOwn(ordenes, orden ?? '')) {
  console.log('Uso: mipanel-agente vincular CODIGO [nombre] | iniciar | enviar | estado | red | desvincular')
  process.exit(orden ? 2 : 0)
}
elegida().catch((e: unknown) => {
  console.error((e as Error).message ?? e)
  process.exit(1)
})
