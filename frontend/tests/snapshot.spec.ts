import { expect, test } from '@playwright/test'
import { dismissApiKeyGate } from './helpers'

// E2E do snapshot no create-run (plan 2, T5): com pipeline selecionado, o
// botão Run abre o modal de preview/edição do snapshot antes de criar. Sem
// backend, a biblioteca de pipelines é injetada via hook __lfTest (App.tsx
// expõe setter `pipelines` dev-only — mesmo padrão do setPrincipal do rbac).
test('create-run com pipeline selecionado abre modal de snapshot', async ({ page }) => {
  await page.goto('/')
  await dismissApiKeyGate(page)
  // Hook E2E existe só após o mount (useEffect dev-only) — sincroniza antes.
  await page.waitForFunction(() => '__lfTest' in window)
  // Injeta o pipeline no store via hook (sem backend, o select do NewRunForm
  // precisa de opções reais — fetchPipelines falharia com ECONNREFUSED).
  await page.evaluate(() => {
    const w = window as unknown as { __lfTest: Record<string, unknown> }
    w.__lfTest.pipelines = [
      { id: 'p1', name: 'SnapPipe', description: 'desc', nodes: [{ id: 'n1', type: 'agent', agent_id: null, config: {} }], edges: [], created_at: '', updated_at: '' },
    ]
  })
  await page.getByLabel('Idea').fill('e2e snapshot')
  await page.getByLabel('Pipeline (optional)').selectOption('p1')
  await page.getByText('Run', { exact: true }).click()
  await expect(page.getByText('Snapshot do pipeline').first()).toBeVisible()
  await page.getByLabel('Descrição do snapshot').fill('desc e2e')
  await page.getByText('Criar run').click()
})
