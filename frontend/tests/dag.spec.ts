import { test, expect } from '@playwright/test'
import { dismissApiKeyGate } from './helpers'

// Smoke do DAG — documentado nesta task; o botão "Run demo" chega na Task 7.
// (Brief Task 6: "nesta task o smoke pode ser adiado p/ Task 7; deixar o spec
// aqui documentado".)
test('DAG renders after demo run', async ({ page }) => {
  await page.goto('/')
  await dismissApiKeyGate(page)
  await page.getByRole('button', { name: /run demo/i }).click()
  // Labels reais do canvas (o nó parallel_audit expande p/ split; o texto
  // "Parallel Audit" solto só existe no filter do console, fora do workspace).
  const dag = page.getByTestId('runs-workspace')
  await expect(dag.getByLabel('Split (parallel audit, Approved)')).toBeVisible()
  await expect(dag.getByText('Tech Lead')).toBeVisible()
})
