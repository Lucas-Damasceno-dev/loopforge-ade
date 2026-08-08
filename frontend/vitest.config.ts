import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Config de testes unitários (Vitest + jsdom).
// Notas:
// - include restrito a src/: os specs Playwright vivem em tests/ e rodam
//   via `npm run test:e2e`, não pelo Vitest.
// - passWithNoTests: a Task 1 ainda não tem testes de unidade (0 tests passa).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    passWithNoTests: true,
  },
})
