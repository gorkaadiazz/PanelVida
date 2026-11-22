/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
// En los tests (Vitest pone VITEST=true) no hace falta el plugin PWA.
const enTests = process.env.VITEST === 'true'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
  },
  build: {
    rolldownOptions: {
      output: {
        // React y supabase-js aparte: cambian poco, así que tras publicar una
        // versión nueva el navegador solo vuelve a bajar el código de la app.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    !enTests &&
    VitePWA({
      // La versión nueva no se activa sola: AvisoActualizacion pregunta antes.
      registerType: 'prompt',
      manifest: {
        name: 'Mi Panel',
        short_name: 'Mi Panel',
        description: 'Panel de vida personal: hábitos, tareas, dinero, negocio y los estudios de 2º SMR.',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#f3f6f9',
        background_color: '#f3f6f9',
        // «Compartir → Mi Panel» en Android: lo recoge public/share-sw.js y lo lleva al Puente
        share_target: {
          action: '/compartir',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'titulo',
            text: 'texto',
            url: 'enlace',
            files: [{ name: 'archivos', accept: ['*/*'] }],
          },
        },
        icons: [
          { src: '/icons/icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icono.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // Solo la app shell. SIN runtimeCaching: nunca se guardan respuestas
        // de la API de Supabase (*.supabase.co) ni de ningún otro origen.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        // Avisos de los recordatorios (public/push-sw.js) y «Compartir → Mi Panel» (public/share-sw.js)
        importScripts: ['push-sw.js', 'share-sw.js'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
