import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const MOCK = 'localhost:48112';

export default defineConfig({
  plugins: [
    tailwindcss(),
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'theme.js'],
      manifest: {
        name: 'Pocket Pilot',
        short_name: 'Pocket Pilot',
        description: 'Monitor and steer VS Code chat agents.',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: '#1e1e2e',
        background_color: '#1e1e2e',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/ws$/, /^\/internal$/]
      }
    })
  ],
  server: {
    proxy: {
      '/api': `http://${MOCK}`,
      '/ws': { target: `ws://${MOCK}`, ws: true }
    }
  }
});
