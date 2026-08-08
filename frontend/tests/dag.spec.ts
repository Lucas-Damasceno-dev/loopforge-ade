import { test, expect } from '@playwright/test'
import { dismissApiKeyGate } from './helpers'

// Smoke do DAG — documentado nesta task; o botão "Run demo" chega na Task 7.
// (Brief Task 6: "nesta task o smoke pode ser adiado p/ Task 7; deixar o spec
// aqui documentado".)
test('DAG renders after demo run', async ({ page }) => {
  await page.goto('/')
  await dismissApiKeyGate(page)
  await page.getByRole('button', { name: /run demo/i }).click()
  // Escopado ao canvas: o console (T8) repete os rótulos nos <option> do
  // filter de nó — getByText solto viraria strict mode violation.
  const dag = page.getByTestId('runs-workspace')
  await expect(dag.getByText('Parallel Audit')).toBeVisible()
  await expect(dag.getByText('Tech Lead')).toBeVisible()
})
