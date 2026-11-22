// Agente del PC · dónde se guardan la configuración y las credenciales.
// ~/.config/mipanel/ (carpeta 700) con config.json y credenciales.json (600).

import { chmod, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { leerConfig, leerCredenciales, permisosSeguros, type Config, type Credenciales } from './lib/config.ts'

export const CARPETA = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'mipanel')
export const ARCHIVO_CONFIG = join(CARPETA, 'config.json')
export const ARCHIVO_CREDENCIALES = join(CARPETA, 'credenciales.json')

async function leerJson(ruta: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(ruta, 'utf8'))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw new Error(`${ruta} no es un JSON válido`, { cause: e })
  }
}

export async function cargarConfig(): Promise<Config> {
  const { config, avisos } = leerConfig((await leerJson(ARCHIVO_CONFIG)) ?? {})
  for (const a of avisos) console.warn(`config.json: ${a}`)
  return config
}

export async function cargarCredenciales(): Promise<Credenciales | null> {
  const json = await leerJson(ARCHIVO_CREDENCIALES)
  if (json === undefined) return null
  const { mode } = await stat(ARCHIVO_CREDENCIALES)
  if (!permisosSeguros(mode)) {
    // Si otros usuarios del PC pueden leerlas, se arreglan los permisos
    console.warn('credenciales.json se podía leer por otros usuarios: se dejan solo para ti (600)')
    await chmod(ARCHIVO_CREDENCIALES, 0o600)
  }
  return leerCredenciales(json)
}

export async function guardarCredenciales(c: Credenciales): Promise<void> {
  await mkdir(CARPETA, { recursive: true, mode: 0o700 })
  await chmod(CARPETA, 0o700)
  // Se crea ya con 600 (no se escribe primero y se cambian los permisos después)
  await writeFile(ARCHIVO_CREDENCIALES, `${JSON.stringify(c, null, 2)}\n`, { mode: 0o600 })
  await chmod(ARCHIVO_CREDENCIALES, 0o600)
}

export async function borrarCredenciales(): Promise<void> {
  await rm(ARCHIVO_CREDENCIALES, { force: true })
}
