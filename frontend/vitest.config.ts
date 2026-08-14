import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Config de testes unitários (Vitest + jsdom).
// Notas:
// - include restrito a src/: os specs Playwright vivem em tests/ e rodam
//   via `npm run test:e2e`, não pelo Vitest.
// - passWithNoTests: a Task 1 ainda não tem testes de unidade (0 tests passa).
// - environmentOptions.url: origem fixa p/ o jsdom (evita o warning "Not
//   implemented: navigation to another Document" no clique de download blob).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost:8787/',
      },
    },
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    passWithNoTests: true,
    testTimeout: 15000,
  },
})
