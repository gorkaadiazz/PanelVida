// Notificaciones de los recordatorios. Lo carga el service worker de la app
// (vite.config.ts → workbox.importScripts). Sin dependencias.
//
// El mensaje llega cifrado desde la Edge Function `recordatorios` y el
// navegador ya lo entrega descifrado: { titulo, cuerpo }. Al tocar la
// notificación se abre (o se enfoca) la app: en Inicio, o en la pantalla de
// una lista FIJA según el tipo de aviso. Nunca una dirección que venga en el mensaje.

// Tipo de aviso → etiqueta (uno nuevo del mismo tipo sustituye al anterior) y pantalla
const TIPOS = {
  recordatorio: { tag: 'recordatorio', ruta: '/' },
  red: { tag: 'red', ruta: '/casa/red' },
}
const tipoDe = (datos) => (typeof datos.tipo === 'string' && Object.hasOwn(TIPOS, datos.tipo) ? TIPOS[datos.tipo] : TIPOS.recordatorio)

self.addEventListener('push', (evento) => {
  let datos = {}
  try {
    datos = evento.data ? evento.data.json() : {}
  } catch {
    datos = {}
  }
  if (typeof datos !== 'object' || datos === null) datos = {}
  const titulo = typeof datos.titulo === 'string' && datos.titulo ? datos.titulo.slice(0, 80) : 'Mi Panel'
  const cuerpo = typeof datos.cuerpo === 'string' ? datos.cuerpo.slice(0, 300) : ''
  evento.waitUntil(
    self.registration.showNotification(titulo, {
      body: cuerpo,
      icon: '/icons/icono-192.png',
      badge: '/icons/icono-192.png',
      lang: 'es',
      tag: tipoDe(datos).tag, // uno nuevo del mismo tipo sustituye al anterior
      data: { ruta: tipoDe(datos).ruta },
    }),
  )
})

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()
  // Solo una de las rutas de TIPOS (la notificación la creó este mismo archivo)
  const pedida = evento.notification.data && evento.notification.data.ruta
  const ruta = Object.values(TIPOS).some((t) => t.ruta === pedida) ? pedida : '/'
  evento.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const propia = ventanas.find((v) => new URL(v.url).origin === self.location.origin)
      if (propia) {
        await propia.focus()
        if ('navigate' in propia) await propia.navigate(ruta).catch(() => {})
        return
      }
      await self.clients.openWindow(ruta)
    })(),
  )
})
