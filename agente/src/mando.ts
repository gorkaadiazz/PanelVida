// Agente del PC · ejecutar las órdenes del Mando.
// Siempre execFile/spawn con un programa y una lista de argumentos que salen
// de lib/acciones.ts (lista fija) o de tu config.json. Nunca una shell.

import { execFile, spawn } from 'node:child_process'
import { userInfo } from 'node:os'
import { promisify } from 'node:util'
import { leerVolumen, type Orden } from './lib/acciones.ts'

const ejecutarArchivo = promisify(execFile)
const ESPERA_MS = 10_000

export async function ejecutar(orden: Orden): Promise<void> {
  if (orden.separado) {
    // Una app: se lanza y se deja vivir sola (no se espera a que se cierre)
    await new Promise<void>((ok, mal) => {
      const hijo = spawn(orden.programa, orden.args, { detached: true, stdio: 'ignore' })
      hijo.once('error', mal)
      hijo.once('spawn', () => {
        hijo.unref()
        ok()
      })
    })
    return
  }
  await ejecutarArchivo(orden.programa, orden.args, { timeout: ESPERA_MS })
}

/** El id de tu sesión gráfica (para bloquear la pantalla): `loginctl show-user` → Display. */
export async function sesionGrafica(): Promise<string | null> {
  try {
    const { stdout } = await ejecutarArchivo('loginctl', ['show-user', String(userInfo().uid), '-p', 'Display', '--value'], { timeout: ESPERA_MS })
    const id = stdout.trim()
    return id || null
  } catch {
    return null
  }
}

export async function volumenActual(): Promise<{ volumen: number; silenciado: boolean } | null> {
  try {
    const { stdout } = await ejecutarArchivo('wpctl', ['get-volume', '@DEFAULT_AUDIO_SINK@'], { timeout: ESPERA_MS })
    return leerVolumen(stdout)
  } catch {
    return null
  }
}
