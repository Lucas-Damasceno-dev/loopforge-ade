import { test, expect } from '@playwright/test'
import { dismissApiKeyGate } from './helpers'

// Erros silenciosos (item 2): boot com backend down mostra aviso + "Tentar
// novamente" (re-lista runs); falha do resume mostra erro visível e a run
// permanece paused. Tudo com route interception (sem backend real).

test('boot: backend down (500) mostra aviso legível + Tentar novamente', async ({ page }) => {
  await page.route('**/api/v1/runs?*', (route) =>
    route.fulfill({ status: 500, json: { detail: 'internal error' } }),
  )
  await page.goto('/')
  await dismissApiKeyGate(page)
  await expect(page.getByTestId('boot-error')).toContainText(/não foi possível carregar runs/i)
  await expect(page.getByRole('button', { name: /tentar novamente/i })).toBeVisible()
})

test('boot: Tentar novamente recarrega runs após a falha', async ({ page }) => {
  let fail = true
  await page.route('**/api/v1/runs?*', (route) => {
    if (fail) {
      fail = false
      return route.fulfill({ status: 500, json: { detail: 'internal error' } })
    }
    return route.fulfill({ json: { items: [{ id: 'r1', idea: 'x', stack: 'python', status: 'running' }], total: 1 } })
  })
  await page.goto('/')
  await dismissApiKeyGate(page)
  await expect(page.getByTestId('boot-error')).toBeVisible()
  await page.getByRole('button', { name: /tentar novamente/i }).click()
  await expect(page.getByTestId('boot-error')).toBeHidden()
  await expect(page.getByTestId('runs-workspace').getByRole('tab').first()).toBeVisible()
})

test('resume: falha mostra erro visível e run permanece paused', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url()
    if (url.endsWith('/resume')) {
      return route.fulfill({ status: 500, json: { detail: 'engine down' } })
    }
    if (route.request().method() === 'GET' && url.includes('/api/v1/runs?')) {
      return route.fulfill({ json: { items: [{ id: 'r1', idea: 'x', stack: 'python', status: 'paused' }], total: 1 } })
    }
    return route.continue()
  })

  await page.goto('/')
  await dismissApiKeyGate(page)
  const workspace = page.getByTestId('runs-workspace')

  await expect(workspace.getByRole('button', { name: /^resume$/i }).first()).toBeVisible()
  await workspace.getByRole('button', { name: /^resume$/i }).first().click()

  // Erro visível (role=alert) + banner de paused continua (run não mudou).
  await expect(workspace.getByRole('alert')).toContainText('engine down')
  await expect(page.getByTestId('run-paused-banner')).toBeVisible()
})
