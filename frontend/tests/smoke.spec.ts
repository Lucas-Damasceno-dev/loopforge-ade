import { test, expect, type Page } from '@playwright/test'
import { dismissApiKeyGate } from './helpers'

// Smoke E2E — QA da SPA da ADE em modo demo (sem backend):
//  (a) a página carrega e a topbar renderiza (título do app);
//  (b) o DAG/canvas existe após rodar a demo (pipeline sintético ~2,1s);
//  (c) zero erros de console legítimos.
//
// Erros de rede CONHECIDOS no modo demo (backend ausente) — ignorados:
//  • handshake WebSocket ws://<host>/ws/streaming falha (o client tenta
//    reconectar com backoff) → o Chromium loga erro de console;
//  • chamadas /api/v1/* via proxy do Vite → ECONNREFUSED → 500 → o browser
//    loga "Failed to load resource ... 500" (ex.: CostBar → getRunCost).
//  Para não mascarar falha real, ao final ASSERTAMOS que todo response 5xx
//  capturado foi de uma URL /api/ (nunca asset/estático).
const WS_HANDSHAKE_RE = /WebSocket connection to .* failed/i
const RESOURCE_FAILURE_RE = /Failed to load resource: the server responded with a status of 5\d\d/i
// S3 (T10): NewRunForm fetches pipelines no mount — no modo demo o backend
// está ausente → o pipelinesStore loga o erro esperado (mesmo caso dos 5xx de
// /api/ filtrados acima). Filtro documentado — em produção (backend real) o
// fetch resolve e nada é logado.
const DEMO_PIPELINES_RE = /Failed to load pipelines: .*ApiError/i

function watchNetwork(page: Page): { errors: string[]; api5xx: string[] } {
  const errors: string[] = []
  const api5xx: string[] = []
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (WS_HANDSHAKE_RE.test(text)) return
    if (RESOURCE_FAILURE_RE.test(text)) return
    if (DEMO_PIPELINES_RE.test(text)) return
    errors.push(`console.error: ${text}`)
  })
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
  page.on('response', (res) => {
    if (res.status() >= 500) api5xx.push(`${res.status()} ${res.url()}`)
  })
  return { errors, api5xx }
}

test('app loads, runs demo and renders the DAG with a clean console', async ({ page }) => {
  const { errors, api5xx } = watchNetwork(page)

  // (a) Topbar renderiza: heading estável + data-testid próprio.
  await page.goto('/')
  await expect(page.getByTestId('topbar')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'LoopForge ADE' })).toBeVisible()

  // ApiKeyGate (B2/M-20): sem key salva o overlay "API key required" abre ao
  // entrar. O caminho do demo é dispensar — sem key o app segue funcional.
  // Condicional p/ não quebrar se o ambiente já tiver key (VITE_API_KEY).
  await dismissApiKeyGate(page)

  // (b) Inicia a demo → pipeline sintético termina → selectRun → canvas monta.
  // O demo é E2E interno (dispatchWsEvent → wsBridge → stores), sem backend.
  await page.getByRole('button', { name: /run demo/i }).first().click()

  // Container raiz do React Flow (`.react-flow`) — estável e independente do
  // conteúdo do DAG.
  const dag = page.locator('.react-flow')
  await expect(dag).toBeVisible({ timeout: 10_000 })

  // Nós de agentes renderizam com o label estável do mock: todos os nós de
  // execução completam (aria-label "<Node> (Approved)" — AgentNode.tsx).
  await expect(page.getByLabel('CPO (Approved)')).toBeVisible({ timeout: 10_000 })
  // S4: parallel_audit é expandido no canvas (split/appsec/devops/merge).
  await expect(page.getByLabel('Split (parallel audit, Approved)')).toBeVisible()
  await expect(page.getByLabel('AppSec (Approved)')).toBeVisible()

  // (c) Zero erros de console legítimos.
  expect(errors).toEqual([])

  // Sanity check da rede: todo 5xx veio do backend ausente via /api/ — nunca
  // de assets. Se um asset 500ar, a checagem (c) o pegaria como erro real
  // apenas se logado; este assert garante que não silenciamos nada estranho.
  const nonApi5xx = api5xx.filter((entry) => !entry.includes('/api/'))
  expect(nonApi5xx).toEqual([])
})

test('artifacts panel opens from topbar and renders drawer', async ({ page }) => {
  await page.goto('/')
  await dismissApiKeyGate(page)
  await page.getByRole('button', { name: 'Run demo' }).click()
  await expect(page.locator('.react-flow')).toBeVisible({ timeout: 10_000 })

  const artifactsBtn = page.getByRole('button', { name: 'Artifacts' })
  await expect(artifactsBtn).toBeVisible()
  await artifactsBtn.click()
  // S1: views abrem na sidebar (resumo) — o drawer completo exige "Open panel".
  await page.getByRole('button', { name: 'Open Artifacts panel' }).click()

  await expect(page.getByText('Generated Artifacts & Files')).toBeVisible()
})
