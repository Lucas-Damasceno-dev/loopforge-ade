import { test, expect } from '@playwright/test'

test('app loads and renders root', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('app-root')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'LoopForge ADE' })).toBeVisible()
})
