import { test, expect } from '@playwright/test'
import { dismissApiKeyGate } from './helpers'

test('navigation: demo run creates tab and DAG renders', async ({ page }) => {
  await page.goto('/')
  await dismissApiKeyGate(page)
  await page.getByRole('button', { name: /run demo/i }).click()
  const runTabs = page.getByRole('tablist', { name: 'Runs' }).getByRole('tab')
  await expect(runTabs.first()).toBeVisible()
  // Nós de execução completam na demo (labels reais do canvas — o nó
  // parallel_audit expande p/ split (smoke.spec); 'Parallel Audit' como texto
  // só existe no filter do console, fora do workspace).
  const dag = page.getByTestId('runs-workspace')
  await expect(dag.getByLabel('Split (parallel audit, Approved)')).toBeVisible()
  await expect(dag.getByLabel('Developer (Approved)')).toBeVisible()
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
  // Escopado ao Activity rail: o ConsolePanel também tem botão "Terminal"
  // (strict mode violaria com getByRole solto). Views pesadas (T3) abrem o
  // resumo na sidebar; o drawer completo exige "Open <view> panel" (aria-label
  // do SidebarHost) — mesmo padrão do smoke (Artifacts).
  const rail = page.getByRole('navigation', { name: 'Activity' })
  const openPanel = (label: string) => page.getByRole('button', { name: `Open ${label} panel` })

  // Open Terminal
  await rail.getByRole('button', { name: 'Terminal' }).click()
  await openPanel('Terminal').click()
  await expect(page.getByRole('heading', { name: 'Interactive Web Terminal' })).toBeVisible()
  await page.keyboard.press('Escape')

  // Open AST
  await rail.getByRole('button', { name: 'AST & Deps' }).click()
  await openPanel('AST & Deps').click()
  await expect(page.getByRole('heading', { name: 'AST & Module Dependencies' })).toBeVisible()
  await page.keyboard.press('Escape')

  // Open Coverage
  await rail.getByRole('button', { name: 'Coverage' }).click()
  await openPanel('Coverage').click()
  await expect(page.getByRole('heading', { name: 'Test Code Coverage' })).toBeVisible()
  await page.keyboard.press('Escape')

  // Open Docker
  await rail.getByRole('button', { name: 'Docker' }).click()
  await openPanel('Docker').click()
  await expect(page.getByRole('heading', { name: 'Docker & Devcontainer' })).toBeVisible()
  await page.keyboard.press('Escape')
})

