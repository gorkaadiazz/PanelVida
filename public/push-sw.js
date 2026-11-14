// Notificaciones de los recordatorios. Lo carga el service worker de la app
// (vite.config.ts → workbox.importScripts). Sin dependencias.
//
// El mensaje llega cifrado desde la Edge Function `recordatorios` y el
// navegador ya lo entrega descifrado: { titulo, cuerpo }. Al tocar la
// notificación se abre (o se enfoca) la app en Inicio: nunca una dirección
// que venga en el mensaje.

self.addEventListener('push', (evento) => {
  let datos = {}
  try {
    datos = evento.data ? evento.data.json() : {}
  } catch {
    datos = {}
  }
  const titulo = typeof datos.titulo === 'string' && datos.titulo ? datos.titulo.slice(0, 80) : 'Mi Panel'
  const cuerpo = typeof datos.cuerpo === 'string' ? datos.cuerpo.slice(0, 300) : ''
  evento.waitUntil(
    self.registration.showNotification(titulo, {
      body: cuerpo,
      icon: '/icons/icono-192.png',
      badge: '/icons/icono-192.png',
      lang: 'es',
      tag: 'recordatorio', // uno nuevo sustituye al anterior
    }),
  )
})

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()
  evento.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const propia = ventanas.find((v) => new URL(v.url).origin === self.location.origin)
      if (propia) {
        await propia.focus()
        if ('navigate' in propia) await propia.navigate('/').catch(() => {})
        return
      }
      await self.clients.openWindow('/')
    })(),
  )
})
