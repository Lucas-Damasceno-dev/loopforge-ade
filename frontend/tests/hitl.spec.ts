import { test, expect } from '@playwright/test'
import { dismissApiKeyGate } from './helpers'

// Hook E2E exposto pelo App em dev (item 6): mesmo caminho real do WS
// (dispatchWsEvent → wsBridge → stores), sem backend.
interface LfTestHook {
  dispatchWsEvent: (e: Record<string, unknown>) => void
  runs: () => Array<{ id: string; status: string }>
  activeRunId: () => string | null
}

declare global {
  interface Window {
    __lfTest?: LfTestHook
  }
}

// Contrato novo HITL (item 6): o backend emite hitl_gate_reached (nunca
// run_paused) — o FE deve pausar o nó + a run e abrir o drawer. Approve →
// decideRun valida → nó liberado → drawer fecha; pipeline_resumed retoma.
test('HITL: gate abre o drawer, approve decide e o estado limpa', async ({ page }) => {
  await page.goto('/')
  await dismissApiKeyGate(page)
  await page.getByRole('button', { name: /run demo/i }).first().click()

  // Demo completa (~2,1s): espera o último nó de execução aprovado para não
  // competir com o node_execution (que sobrescreveria o paused do gate).
  await expect(page.getByLabel('QA (Approved)')).toBeVisible({ timeout: 10_000 })

  // decideRun interceptado → sucesso (sem backend real).
  await page.route('**/api/v1/runs/*/decide', (route) =>
    route.fulfill({
      json: {
        id: 'd1', run_id: 'demo', gate_node: 'qa', action: 'approve',
        feedback_category: 'general', user: 'human', timestamp: '2026-08-15T00:00:00Z',
      },
    }),
  )

  // Emite hitl_gate_reached pelo caminho real → wsBridge pausa nó + run.
  const runId = await page.evaluate(() => {
    const r = window.__lfTest?.runs()[0]
    if (!r) throw new Error('no run after demo')
    return r.id
  })
  await page.evaluate((rid) => {
    window.__lfTest?.dispatchWsEvent({
      event: 'hitl_gate_reached',
      run_id: rid,
      payload: { gate_node: 'qa', thread_id: `run-${rid}`, timeout_seconds: 300, on_timeout: 'pause' },
    })
  }, runId)

  // Drawer HITL abre + run paused + banner de espera (item 1, sem Budget override).
  await expect(page.getByText('Human in the loop')).toBeVisible()
  await expect(page.getByText('Waiting for decision')).toBeVisible()
  await expect(page.getByTestId('run-hitl-banner')).toContainText(/waiting for your decision at gate qa/i)

  // Approve → POST decide (interceptado) → nó approved → drawer fecha.
  await page.getByRole('button', { name: /^approve$/i }).click()
  await expect(page.getByText('Human in the loop')).toBeHidden()

  // Backend (simulado) registra a decisão e retoma a run → banner some.
  await page.evaluate((rid) => {
    window.__lfTest?.dispatchWsEvent({
      event: 'human_decision_submitted', run_id: rid, payload: { action: 'approve', gate_node: 'qa' },
    })
    window.__lfTest?.dispatchWsEvent({ event: 'pipeline_resumed', run_id: rid, payload: {} })
  }, runId)
  await expect(page.getByTestId('run-hitl-banner')).toBeHidden()
})
