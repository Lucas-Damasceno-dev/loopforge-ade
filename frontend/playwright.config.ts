import { defineConfig } from '@playwright/test'

// Smoke E2E — roda contra o dev server do Vite (127.0.0.1:5173).
export default defineConfig({
  testDir: 'tests',
  use: { baseURL: 'http://127.0.0.1:5173' },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
})
