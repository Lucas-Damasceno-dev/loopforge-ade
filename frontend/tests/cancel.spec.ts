import { test, expect } from '@playwright/test'
import { dismissApiKeyGate } from './helpers'

// Contrato novo de cancelamento (item 6): POST /runs/{id}/cancel com
// confirmação de 2 cliques; 409 mostra o erro real sem perder o estado.
// Runs vêm do boot (route interception em /api/v1/runs).

test('cancel: run running → 2 cliques confirmam e POST /cancel é enviado', async ({ page }) => {
  let cancelMethod = ''
  let cancelUrl = ''
  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()
    if (url.endsWith('/cancel')) {
      cancelMethod = method
      cancelUrl = url
      return route.fulfill({ json: { id: 'r1', idea: 'x', stack: 'python', status: 'failed' } })
    }
    if (method === 'GET' && url.includes('/api/v1/runs?')) {
      return route.fulfill({ json: { items: [{ id: 'r1', idea: 'x', stack: 'python', status: 'running' }], total: 1 } })
    }
    return route.continue()
  })

  await page.goto('/')
  await dismissApiKeyGate(page)
  const workspace = page.getByTestId('runs-workspace')

  await expect(workspace.getByRole('button', { name: /^cancel$/i })).toBeVisible()
  await workspace.getByRole('button', { name: /^cancel$/i }).click()
  await expect(workspace.getByRole('button', { name: /confirm cancel/i })).toBeVisible()
  await workspace.getByRole('button', { name: /confirm cancel/i }).click()

  // Fallback local (cancelRun responde) → run vira failed → botão some.
  await expect(workspace.getByRole('button', { name: /^cancel$/i })).toBeHidden()
  expect(cancelMethod).toBe('POST')
  expect(cancelUrl).toContain('/api/v1/runs/r1/cancel')
})

test('cancel: 409 mostra erro real e run permanece cancelável (paused)', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url()
    if (url.endsWith('/cancel')) {
      return route.fulfill({ status: 409, json: { detail: 'run not cancellable' } })
    }
    if (route.request().method() === 'GET' && url.includes('/api/v1/runs?')) {
      return route.fulfill({ json: { items: [{ id: 'r1', idea: 'x', stack: 'python', status: 'paused' }], total: 1 } })
    }
    return route.continue()
  })

  await page.goto('/')
  await dismissApiKeyGate(page)
  const workspace = page.getByTestId('runs-workspace')

  await expect(workspace.getByRole('button', { name: /^cancel$/i })).toBeVisible()
  await workspace.getByRole('button', { name: /^cancel$/i }).click()
  await workspace.getByRole('button', { name: /confirm cancel/i }).click()

  // Mensagem do backend visível (role=alert); botão segue disponível.
  await expect(workspace.getByRole('alert')).toContainText('run not cancellable')
  await expect(workspace.getByRole('button', { name: /^cancel$/i })).toBeVisible()
})
