// Genera las claves VAPID de los recordatorios (notificaciones Web Push).
//
//   node scripts/claves-recordatorios.mjs
//
// · La clave PRIVADA se guarda en supabase/functions/.env (está en
//   .gitignore: nunca se sube). No se muestra en pantalla.
// · La clave PÚBLICA se escribe en src/lib/recordatorios.ts (es pública:
//   la necesita el navegador para suscribirse).
// · Después: npx supabase secrets set --env-file supabase/functions/.env
//
// Si ya hay claves no hace nada: cambiarlas invalida las suscripciones de
// todos los dispositivos (habría que volver a activar los recordatorios).

import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const ENV = 'supabase/functions/.env'
const CODIGO = 'src/lib/recordatorios.ts'
const b64url = (b) => Buffer.from(b).toString('base64url')

if (existsSync(ENV) && readFileSync(ENV, 'utf8').includes('VAPID_PRIVATE_KEY=')) {
  console.log(`Ya hay claves en ${ENV}: no se generan otras.`)
  process.exit(0)
}

const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const publica = b64url(new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey)))
const privada = (await crypto.subtle.exportKey('jwk', par.privateKey)).d

const previo = existsSync(ENV) ? readFileSync(ENV, 'utf8').trimEnd() + '\n' : ''
writeFileSync(
  ENV,
  `${previo}# Recordatorios (Web Push). NO subir: está en .gitignore.\n` +
    `VAPID_PUBLIC_KEY=${publica}\nVAPID_PRIVATE_KEY=${privada}\n` +
    `# Contacto para los servicios de notificaciones: la dirección de tu web\n` +
    `VAPID_SUBJECT=https://TU-SITIO.netlify.app\n`,
  { mode: 0o600 },
)

const codigo = readFileSync(CODIGO, 'utf8')
writeFileSync(CODIGO, codigo.replace(/export const CLAVE_PUBLICA_VAPID = '[^']*'/, `export const CLAVE_PUBLICA_VAPID = '${publica}'`))

console.log(`Claves creadas. Privada en ${ENV} (no se sube). Pública en ${CODIGO}.`)
console.log(`Cambia VAPID_SUBJECT en ${ENV} por la dirección de tu web y luego:`)
console.log('  npx supabase secrets set --env-file supabase/functions/.env')
