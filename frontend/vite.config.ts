import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { realpathSync } from 'node:fs'

// Worktree E2E: node_modules é symlink p/ o checkout principal — o realpath
// (fora do workspace root) fica fora do server.fs.allow default e o Vite
// devolve 403 p/ fontes via /@fs/ (quebra o "clean console" do smoke.spec).
// Permitir o realpath é dev-only e no-op no checkout principal (path já
// permitido). Fallback: o próprio root, se o symlink não existir.
const nodeModulesReal = (() => {
  try {
    return realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), 'node_modules'))
  } catch {
    return undefined
  }
})()

// Dev proxy → backend real (porta padrão do `lf serve`); ajustável via env.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    fs: { allow: nodeModulesReal ? ['.', nodeModulesReal] : ['.'] },
    proxy: {
      '/api': { target: process.env.VITE_API_TARGET ?? 'http://127.0.0.1:8787', changeOrigin: false },
      '/ws': { target: process.env.VITE_API_TARGET ?? 'http://127.0.0.1:8787', ws: true },
      // /health é raiz (sem prefixo /api/v1, sem auth) — HealthPanel faz polling.
      '/health': { target: process.env.VITE_API_TARGET ?? 'http://127.0.0.1:8787', changeOrigin: false },
    },
  },
  build: { outDir: 'dist' },
})
