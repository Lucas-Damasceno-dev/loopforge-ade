import { test, expect } from '@playwright/test'

test('navigation: demo run creates tab and DAG renders', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /run demo/i }).click()
  await expect(page.getByRole('tab')).toHaveCount(1)
  // Escopado ao canvas — o console (T8) repete os rótulos no filter de nó.
  const dag = page.getByTestId('runs-workspace')
  await expect(dag.getByText('Parallel Audit')).toBeVisible()
  await expect(dag.getByText('Dev')).toBeVisible()
})

test('navigation: tabs switch runs', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /run demo/i }).click()
  await page.getByRole('button', { name: /run demo/i }).click() // segunda run → fila
  await expect(page.getByRole('tab')).toHaveCount(2)
})
