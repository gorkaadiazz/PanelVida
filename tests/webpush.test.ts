// Cifrado Web Push (supabase/functions/_shared/webpush.ts) comprobado con el
// ejemplo oficial del RFC 8291 (sección 5 y apéndice A), y la firma VAPID
// verificada con la clave pública.
import { describe, expect, it } from 'vitest'
import { aBase64url, cabeceraVapid, cifrar, clavesEfimerasDe, deBase64url } from '../supabase/functions/_shared/webpush.ts'

const b = (s: string) => deBase64url(s.replace(/\s/g, ''))

const RFC = {
  claro: 'When I grow up, I want to be a watermelon',
  asPublica: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivada: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublica: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  sal: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  cuerpo: `DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml
           mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT
           pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN`,
}

describe('Web Push: cifrado (RFC 8291)', () => {
  it('da exactamente el mensaje cifrado del ejemplo del RFC', async () => {
    const cuerpo = await cifrar(new TextEncoder().encode(RFC.claro), { p256dh: RFC.uaPublica, auth: RFC.auth }, {
      sal: b(RFC.sal),
      efimeras: await clavesEfimerasDe(b(RFC.asPublica), b(RFC.asPrivada)),
    })
    expect(aBase64url(cuerpo)).toBe(RFC.cuerpo.replace(/\s/g, ''))
    // 86 de cabecera + 41 del texto + 1 delimitador + 16 de etiqueta GCM (el «Content-Length: 145» del RFC es una errata)
    expect(cuerpo.length).toBe(144)
  })

  it('cada mensaje usa sal y claves nuevas (dos cifrados del mismo texto no se parecen)', async () => {
    const s = { p256dh: RFC.uaPublica, auth: RFC.auth }
    const [a, c] = await Promise.all([cifrar(new TextEncoder().encode('hola'), s), cifrar(new TextEncoder().encode('hola'), s)])
    expect(aBase64url(a.slice(0, 16))).not.toBe(aBase64url(c.slice(0, 16)))
    expect(aBase64url(a.slice(21, 86))).not.toBe(aBase64url(c.slice(21, 86)))
  })

  it('rechaza claves del navegador mal formadas', async () => {
    await expect(cifrar(new Uint8Array(1), { p256dh: RFC.uaPublica, auth: 'AAAA' })).rejects.toThrow()
    await expect(cifrar(new Uint8Array(1), { p256dh: 'AAAA', auth: RFC.auth })).rejects.toThrow()
  })
})

describe('Web Push: VAPID (RFC 8292)', () => {
  it('firma un JWT ES256 para el origen del endpoint que verifica la clave pública', async () => {
    const par = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
    const publica = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey))
    const d = (await crypto.subtle.exportKey('jwk', par.privateKey)).d!
    const vapid = { publica: aBase64url(publica), privada: d, sujeto: 'https://ejemplo.netlify.app' }
    const ahora = Date.UTC(2026, 10, 14, 12)

    const cabecera = await cabeceraVapid('https://fcm.googleapis.com/fcm/send/abc?x=1', vapid, ahora)
    const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(cabecera)!
    expect(k).toBe(vapid.publica)
    const [h, p, firma] = jwt.split('.')
    expect(JSON.parse(new TextDecoder().decode(deBase64url(h)))).toEqual({ typ: 'JWT', alg: 'ES256' })
    expect(JSON.parse(new TextDecoder().decode(deBase64url(p)))).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: ahora / 1000 + 12 * 3600,
      sub: 'https://ejemplo.netlify.app',
    })
    const valida = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, par.publicKey, deBase64url(firma), new TextEncoder().encode(`${h}.${p}`))
    expect(valida).toBe(true)
  })
})

describe('Web Push: solo a servicios de notificaciones conocidos', async () => {
  const { endpointPermitido } = await import('../supabase/functions/_shared/webpush.ts')
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/QAbc',
    'https://wns2-db5p.notify.windows.com/w/?token=abc',
  ])('acepta %s', (e) => expect(endpointPermitido(e)).toBe(true))
  it.each([
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com.malo.test/x',
    'https://malo.test/fcm.googleapis.com',
    'https://fcm.googleapis.com:8443/x',
    'https://usuario@fcm.googleapis.com/x',
    'https://169.254.169.254/latest',
    'https://localhost/x',
    'no es una url',
  ])('rechaza %s', (e) => expect(endpointPermitido(e)).toBe(false))
})
