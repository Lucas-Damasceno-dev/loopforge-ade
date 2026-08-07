import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Dev proxy → backend real (porta padrão do `lf serve`); ajustável via env.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': { target: process.env.VITE_API_TARGET ?? 'http://127.0.0.1:8787', changeOrigin: false },
      '/ws': { target: process.env.VITE_API_TARGET ?? 'http://127.0.0.1:8787', ws: true },
    },
  },
  build: { outDir: 'dist' },
})
