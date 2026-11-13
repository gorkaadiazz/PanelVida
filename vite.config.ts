/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
// En los tests (Vitest pone VITEST=true) no hace falta el plugin PWA.
const enTests = process.env.VITEST === 'true'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
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
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
