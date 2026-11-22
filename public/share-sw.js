// «Compartir → Mi Panel» en Android (Web Share Target). Lo carga el service
// worker de la app (vite.config.ts → workbox.importScripts). Sin dependencias.
//
// Android manda lo compartido con un POST a /compartir (ver share_target en
// el manifest). Aquí se guarda UN momento en IndexedDB (base
// «mi-panel-compartido», que se borra al cerrar sesión con las demás) y se
// abre el Puente, que lo enseña para mandarlo. No se cachea nada de la API ni
// se manda nada a ningún sitio desde aquí.

const BASE_COMPARTIDO = 'mi-panel-compartido'
const MAX_ARCHIVOS = 5
const MAX_TEXTO = 10000

function abrirBaseCompartido() {
  return new Promise((resolve, reject) => {
    const peticion = indexedDB.open(BASE_COMPARTIDO, 1)
    peticion.onupgradeneeded = () => peticion.result.createObjectStore('pendiente')
    peticion.onsuccess = () => resolve(peticion.result)
    peticion.onerror = () => reject(peticion.error)
  })
}

async function guardarCompartido(datos) {
  const base = await abrirBaseCompartido()
  try {
    await new Promise((resolve, reject) => {
      const tx = base.transaction('pendiente', 'readwrite')
      tx.objectStore('pendiente').put(datos, 'ultimo')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    base.close()
  }
}

const texto = (valor) => (typeof valor === 'string' ? valor.slice(0, MAX_TEXTO) : '')

self.addEventListener('fetch', (evento) => {
  const url = new URL(evento.request.url)
  if (evento.request.method !== 'POST' || url.origin !== self.location.origin || url.pathname !== '/compartir') return
  // Lo manda Android (sin referrer, about:client o android-app://). Una web
  // cualquiera podría enviar un formulario a /compartir: eso se ignora.
  const origen = evento.request.referrer
  if (/^https?:/i.test(origen) && new URL(origen).origin !== self.location.origin) {
    evento.respondWith(Response.redirect('/casa/puente', 303))
    return
  }

  evento.respondWith(
    (async () => {
      try {
        const formulario = await evento.request.formData()
        const archivos = formulario
          .getAll('archivos')
          .filter((a) => typeof a === 'object' && a !== null && 'size' in a && a.size > 0)
          .slice(0, MAX_ARCHIVOS)
        await guardarCompartido({
          titulo: texto(formulario.get('titulo')),
          texto: texto(formulario.get('texto')),
          enlace: texto(formulario.get('enlace')),
          archivos,
          cuando: Date.now(),
        })
      } catch (error) {
        console.error('No se pudo recibir lo compartido', error)
      }
      // 303: el navegador abre el Puente con un GET normal
      return Response.redirect('/casa/puente?compartido=1', 303)
    })(),
  )
})
