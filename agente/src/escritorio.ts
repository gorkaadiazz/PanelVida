// Agente del PC · lo que toca el escritorio (KDE Plasma en Wayland).
//
// Todo con execFile: un programa fijo y una lista de argumentos, NUNCA una
// shell. El texto que llega del Puente va por la entrada estándar (wl-copy)
// o como un único argumento (notify-send, qdbus6), así que ni comillas, ni
// `;`, ni `$(...)` pueden ejecutar nada.

import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const ejecutar = promisify(execFile)
const ESPERA_MS = 5000

async function existe(programa: string): Promise<boolean> {
  try {
    await ejecutar('which', [programa], { timeout: ESPERA_MS })
    return true
  } catch {
    return false
  }
}

/** Notificación de escritorio (el título y el cuerpo ya vienen escapados). */
export async function notificar(titulo: string, cuerpo: string): Promise<void> {
  try {
    await ejecutar('notify-send', ['--app-name=Mi Panel', '--icon=mail-send-receive', '--', titulo, cuerpo], { timeout: ESPERA_MS })
  } catch (e) {
    console.warn('No se pudo mostrar la notificación:', (e as Error).message)
  }
}

/** Copia al portapapeles: wl-copy (wl-clipboard) o, si no está, Klipper de KDE por D-Bus. */
export async function copiar(texto: string): Promise<boolean> {
  if (await existe('wl-copy')) {
    return new Promise((ok) => {
      const hijo = spawn('wl-copy', [], { stdio: ['pipe', 'ignore', 'ignore'] })
      hijo.on('error', () => ok(false))
      hijo.on('close', (codigo) => ok(codigo === 0))
      hijo.stdin.end(texto)
    })
  }
  try {
    await ejecutar('qdbus6', ['org.kde.klipper', '/klipper', 'setClipboardContents', texto], { timeout: ESPERA_MS })
    return true
  } catch (e) {
    console.warn('No se pudo copiar al portapapeles (instala wl-clipboard):', (e as Error).message)
    return false
  }
}

/** Lee el portapapeles (texto). null si no se puede. */
export async function leerPortapapeles(): Promise<string | null> {
  try {
    if (await existe('wl-paste')) {
      const { stdout } = await ejecutar('wl-paste', ['--no-newline', '--type', 'text'], { timeout: ESPERA_MS, maxBuffer: 1024 * 1024 })
      return stdout
    }
    const { stdout } = await ejecutar('qdbus6', ['org.kde.klipper', '/klipper', 'getClipboardContents'], { timeout: ESPERA_MS, maxBuffer: 1024 * 1024 })
    return stdout.replace(/\n$/, '')
  } catch (e) {
    console.warn('No se pudo leer el portapapeles (instala wl-clipboard):', (e as Error).message)
    return null
  }
}
