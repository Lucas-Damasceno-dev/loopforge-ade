import { test, expect } from '@playwright/test'

// Smoke do DAG — documentado nesta task; o botão "Run demo" chega na Task 7.
// (Brief Task 6: "nesta task o smoke pode ser adiado p/ Task 7; deixar o spec
// aqui documentado".)
test('DAG renders after demo run', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /run demo/i }).click()
  await expect(page.getByText('Parallel Audit')).toBeVisible()
  await expect(page.getByText('Tech Lead')).toBeVisible()
})
