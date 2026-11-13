import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome90',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:7777',
      '/health': 'http://localhost:7777',
    },
  },
});
