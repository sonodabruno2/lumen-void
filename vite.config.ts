import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ command }) => ({
  // dev (npm run dev) em '/', produção (build → GitHub Pages) em '/lumen-void/'
  base: command === 'build' ? '/lumen-void/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Lumen Void',
        short_name: 'Lumen Void',
        description: 'Um núcleo de luz resiste ao vazio. Sobreviva, derrote os chefes e desperte as forças da natureza.',
        theme_color: '#06080c',
        background_color: '#000000',
        display: 'fullscreen',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
}))
