import { test, expect } from '@playwright/test'
import { dismissApiKeyGate } from './helpers'

test('navigation: demo run creates tab and DAG renders', async ({ page }) => {
  await page.goto('/')
  await dismissApiKeyGate(page)
  await page.getByRole('button', { name: /run demo/i }).click()
  const runTabs = page.getByRole('tablist', { name: 'Runs' }).getByRole('tab')
  await expect(runTabs.first()).toBeVisible()
  // Escopado ao canvas — o console (T8) repete os rótulos no filter de nó.
  const dag = page.getByTestId('runs-workspace')
  await expect(dag.getByText('Parallel Audit')).toBeVisible()
  await expect(dag.getByText('Dev')).toBeVisible()
})

test('navigation: tabs switch runs', async ({ page }) => {
  await page.goto('/')
  await dismissApiKeyGate(page)
  await page.getByRole('button', { name: /run demo/i }).click()
  const runTabs = page.getByRole('tablist', { name: 'Runs' }).getByRole('tab')
  await expect(runTabs.first()).toBeVisible()
  const initialTabs = await runTabs.count()
  await page.getByRole('button', { name: /run demo/i }).click() // segunda run → fila
  await expect(runTabs).toHaveCount(initialTabs + 1)
})

test('drawers: terminal, ast, and coverage open from topbar', async ({ page }) => {
  await page.goto('/')
  await dismissApiKeyGate(page)

  // Open Terminal
  await page.getByRole('button', { name: 'Terminal' }).click()
  await expect(page.getByText('Interactive Web Terminal')).toBeVisible()
  await page.keyboard.press('Escape')

  // Open AST
  await page.getByRole('button', { name: 'AST & Deps' }).click()
  await expect(page.getByText('AST & Module Dependencies')).toBeVisible()
  await page.keyboard.press('Escape')

  // Open Coverage
  await page.getByRole('button', { name: 'Coverage' }).click()
  await expect(page.getByText('Test Code Coverage')).toBeVisible()
  await page.keyboard.press('Escape')

  // Open Docker
  await page.getByRole('button', { name: 'Docker' }).click()
  await expect(page.getByRole('heading', { name: 'Docker & Devcontainer' })).toBeVisible()
  await page.keyboard.press('Escape')
})

