import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // Installable, and works offline once visited: the app and its code are cached up front;
    // the large pdf.js data files, fonts and text recognition files are cached the first time they are used.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Gloss',
        short_name: 'Gloss',
        description: 'Read documents next to a canvas for your thinking. Excerpt, connect and annotate PDFs, privately.',
        theme_color: '#5145e5',
        background_color: '#f4f5f8',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Installed on a computer, Gloss can be chosen to open these files from the file manager.
        file_handlers: [
          {
            action: '/',
            accept: {
              'application/pdf': ['.pdf'],
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
              'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
              'application/zip': ['.gloss'],
            },
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png}', 'pdfjs/standard_fonts/*', 'pdfjs/wasm/*', 'pdfjs/iccs/*'],
        globIgnores: ['**/heic*.js', 'ocr/**'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          { urlPattern: ({ url }) => /^\/(pdfjs|fonts|ocr)\//.test(url.pathname), handler: 'CacheFirst', options: { cacheName: 'gloss-data' } },
          { urlPattern: ({ url }) => /\/heic[^/]*\.js$/.test(url.pathname), handler: 'CacheFirst', options: { cacheName: 'gloss-heic' } },
        ],
      },
    }),
  ],
  // pdf.js is about 600 kB on its own; it loads only once a project is opened.
  build: { target: 'es2023', chunkSizeWarningLimit: 700 },
});
