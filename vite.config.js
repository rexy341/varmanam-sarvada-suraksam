import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.ico', 'favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Varman',
        short_name: 'Varman',
        description: 'Offline-first disaster response and coordination network',
        theme_color: '#0F2A4A',
        background_color: '#0F2A4A',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Android adaptive icon: mark kept inside the safe zone so no device shape mask clips it
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
      // The service worker only runs in the built app (npm run build + npm run preview),
      // not in npm run dev, so it can never serve you a stale copy while you edit.
    })
  ],
  server: { port: 5173 }
})
