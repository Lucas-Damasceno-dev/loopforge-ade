import { expect, test } from '@playwright/test'
import { dismissApiKeyGate } from './helpers'

// RBAC E2E (T7) — viewer vs admin na UI, sem backend: o hook `__lfTest`
// (dev-only, App.tsx) expõe setPrincipal → useAuthStore.setPrincipal, que
// driveia todos os gates de role (VIEW_ROLE no rail, NewRunForm read-only).
type LfTest = {
  setPrincipal(p: { name: string; roles: string[] } | null): void
}

async function setPrincipal(page: import('@playwright/test').Page, roles: string[]) {
  // Garante que o app montou e o hook __lfTest existe antes do evaluate
  // (o useEffect que o define roda após o mount do React).
  await page.waitForFunction(() => '__lfTest' in window)
  await page.evaluate((r) => {
    ;(window as unknown as { __lfTest: LfTest }).__lfTest.setPrincipal({ name: 'e2e-user', roles: r })
  }, roles)
}

test('viewer: sem mcp/settings no rail e sem NewRunForm', async ({ page }) => {
  await page.goto('/')
  await dismissApiKeyGate(page)
  await setPrincipal(page, ['viewer'])
  await page.getByLabel('Activity').waitFor()
  await expect(page.getByLabel('MCP playground')).toHaveCount(0)
  await expect(page.getByLabel('Settings')).toHaveCount(0)
  await expect(page.getByLabel('Idea')).toHaveCount(0)
})

test('admin: mcp/settings visíveis', async ({ page }) => {
  await page.goto('/')
  await dismissApiKeyGate(page)
  await setPrincipal(page, ['admin'])
  await page.getByLabel('Activity').waitFor()
  await expect(page.getByLabel('MCP playground')).toHaveCount(1)
  await expect(page.getByLabel('Settings')).toHaveCount(1)
})
