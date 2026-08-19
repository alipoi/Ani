import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png'],
      manifest: {
        name: 'Nekomi',
        short_name: 'Nekomi',
        description: 'Nekomi 番剧日历与资源站：季度每周放送时间表、字幕组检索与 RSS 订阅。',
        theme_color: '#e8485a',
        background_color: '#fef6f7',
        display: 'standalone',
        icons: [{ src: 'favicon.png', sizes: '192x192', type: 'image/png' }]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,jpg,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/rss\//, /^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/rss/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'rss-cache',
              networkTimeoutSeconds: 5
            }
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5
            }
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/images/') || url.pathname.startsWith('/thumbs/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'img-cache' }
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
      '/rss': 'http://localhost:8080',
      '/images': 'http://localhost:8080'
    }
  },
  build: {
    outDir: 'dist',
    target: 'es2018'
  }
})
