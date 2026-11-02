import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // pdf.js is about 600 kB on its own; it loads only once a project is opened.
  build: { target: 'es2023', chunkSizeWarningLimit: 700 },
});
