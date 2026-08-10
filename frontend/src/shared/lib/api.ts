import type { AdeConfig, BudgetOverrideRequest, Checkpoint, CostResponse, CreateRunInput, DecisionRecord, DeepPartial, ForkResult, ImportResult, McpServer, McpTool, Run, RunListResponse, TimelineResponse, TrajectoryExport } from './types'

// Base da API v1: VITE_API_BASE opcional (ex.: http://127.0.0.1:8787) —
// default '/api/v1' (no dev, o Vite faz proxy de /api → backend real).
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api/v1'

// Chave de API (B2/M-20): lida de localStorage 'lf_api_key' (tela 401) com
// fallback para VITE_API_KEY (env de build). Sem chave, envia sem header.
const KEY_STORAGE = 'lf_api_key'

export function getApiKey(): string | undefined {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? (import.meta.env.VITE_API_KEY as string | undefined)
  } catch {
    return import.meta.env.VITE_API_KEY as string | undefined
  }
}

export function setApiKey(key: string): void {
  try { localStorage.setItem(KEY_STORAGE, key) } catch { /* storage indisponível (teste/privacy) */ }
}

export class ApiError extends Error {
  constructor(public status: number, public detail: unknown) {
    super(`API ${status}: ${JSON.stringify(detail)}`)
  }
}

// ─── 401 (B2/M-20): gate de API key ─────────────────────────────────────────
// Uma resposta 401 enfileira a chamada pendente e notifica o gate (ApiKeyGate).
// A Promise original só resolve após salvar a key + retryUnauthorizedRequests()
// (reexecução com a nova key) ou rejeita em rejectPendingUnauthorized()
// (dispensa sem key — modo demo/sem backend).

interface RetryRequest {
  path: string
  init: RequestInit
  resolve: (v: unknown) => void
  reject: (e: unknown) => void
}

let retryQueue: RetryRequest[] = []
const unauthorizedListeners = new Set<() => void>()

export function onUnauthorized(fn: () => void): () => void {
  unauthorizedListeners.add(fn)
  return () => { unauthorizedListeners.delete(fn) }
}

export function hasPendingUnauthorized(): boolean {
  return retryQueue.length > 0
}

/** Reexecuta as chamadas pendentes (após salvar a key). */
export function retryUnauthorizedRequests(): void {
  const pending = retryQueue
  retryQueue = []
  for (const req of pending) {
    apiFetch(req.path, req.init).then(req.resolve).catch(req.reject)
  }
}

/** Aborta as chamadas pendentes (dispensa do gate sem key — modo demo). */
export function rejectPendingUnauthorized(): void {
  const pending = retryQueue
  retryQueue = []
  for (const req of pending) req.reject(new ApiError(401, 'Unauthorized — API key not provided'))
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) }
  if (init.body) headers['Content-Type'] = 'application/json'
  const key = getApiKey()
  if (key) headers['X-API-Key'] = key
  const res = await fetch(`${BASE}${path}`, { ...init, headers })

  if (res.status === 401) {
    // Enfileira a chamada pendente; o caller continua aguardando até o retry.
    return new Promise<T>((resolve, reject) => {
      retryQueue.push({ path, init, resolve: resolve as (v: unknown) => void, reject })
      unauthorizedListeners.forEach((fn) => fn())
    })
  }

  if (!res.ok) {
    let detail: unknown = null
    try { detail = (await res.json()).detail } catch { /* corpo não-JSON (ex.: 401 com WWW-Authenticate) */ }
    throw new ApiError(res.status, detail)
  }
  return res.json() as Promise<T>
}

// ─── Endpoints v1 ───────────────────────────────────────────────────────────
export const listRuns = (skip = 0, limit = 50) => apiFetch<RunListResponse>(`/runs?skip=${skip}&limit=${limit}`)
export const getRun = (id: string) => apiFetch<Run>(`/runs/${id}`)
export const createRun = (input: CreateRunInput) =>
  apiFetch<Run>('/runs', {
    method: 'POST',
    body: JSON.stringify({ mock_llm: false, interactive: false, ...input }),
  })
export const resumeRun = (id: string) => apiFetch<Run>(`/runs/${id}/resume`, { method: 'POST' })
export const getDecisions = (id: string) => apiFetch<DecisionRecord[]>(`/runs/${id}/decisions`)
// Decide retorna a decisão gravada (HumanDecisionResponse) — não a Run.
export const decideRun = (id: string, body: Record<string, unknown>) => apiFetch<DecisionRecord>(`/runs/${id}/decide`, { method: 'POST', body: JSON.stringify(body) })

// Custos (M-08/M-10): GET /api/v1/runs/{id}/cost e POST .../cost/override.
export const getRunCost = (id: string) => apiFetch<CostResponse>(`/runs/${id}/cost`)
export const overrideRunBudget = (id: string, body: BudgetOverrideRequest) =>
  apiFetch<CostResponse>(`/runs/${id}/cost/override`, { method: 'POST', body: JSON.stringify(body) })

export const getConfig = () => apiFetch<AdeConfig>('/config')
export const patchConfig = (partial: DeepPartial<AdeConfig>) => apiFetch<AdeConfig>('/config', { method: 'PATCH', body: JSON.stringify(partial) })
export const listMcpServers = () => apiFetch<McpServer[]>('/mcp/servers')
export const listMcpTools = (name: string) => apiFetch<McpTool[]>(`/mcp/servers/${encodeURIComponent(name)}/tools`)

// Execução de tool MCP (Fase D/UC-05): POST /mcp/servers/{name}/tools/{tool}
// body {arguments: {...}} → 200 dict resultado; 403 tool não permitida
// (allowlist do ade.yaml); 503 server não conectado; 404 server inexistente.
export const callMcpTool = (name: string, tool: string, args: Record<string, unknown> = {}) =>
  apiFetch<Record<string, unknown>>(`/mcp/servers/${encodeURIComponent(name)}/tools/${encodeURIComponent(tool)}`, {
    method: 'POST',
    body: JSON.stringify({ arguments: args }),
  })
// O backend retorna [{thread_id}] para a listagem de checkpoints de uma thread.
export const getCheckpoints = (threadId: string) => apiFetch<Array<{ thread_id: string }>>(`/trajectories/${encodeURIComponent(threadId)}/checkpoints`)
export const getCheckpoint = (threadId: string, checkpointId: string) => apiFetch<Checkpoint>(`/trajectories/${encodeURIComponent(threadId)}/checkpoints/${encodeURIComponent(checkpointId)}`)

// ─── Fase C — trajetórias (M-13/M-14/C5) ────────────────────────────────────
// Thread canônica de uma run: `run-{run_id}` (ADR-0003 — trajectories.py).
export const threadIdForRun = (runId: string) => `run-${runId}`

// Fork REAL (M-13): POST /trajectories/{thread_id}/fork → 201 {fork_run_id,
// thread_id, checkpoint_id}; 404 run inexistente; 409 sem checkpoint copiável.
export const forkTrajectory = (threadId: string) =>
  apiFetch<ForkResult>(`/trajectories/${encodeURIComponent(threadId)}/fork`, { method: 'POST' })

// Export enriquecido (M-14): POST /trajectories/export/{run_id} (schema 1.1).
export const exportTrajectory = (runId: string) =>
  apiFetch<TrajectoryExport>(`/trajectories/export/${encodeURIComponent(runId)}`, { method: 'POST' })

// Import (M-14): POST /trajectories/import → 201 {run_id, thread_id,
// checkpoints_imported}; 422 payload inválido; 409 thread já existe.
export const importTrajectory = (payload: TrajectoryExport) =>
  apiFetch<ImportResult>('/trajectories/import', { method: 'POST', body: JSON.stringify(payload) })

// Timeline unificada (C5/M-02): GET /runs/{run_id}/timeline?after_seq=&limit=.
export const getRunTimeline = (runId: string, afterSeq = 0, limit = 50) =>
  apiFetch<TimelineResponse>(`/runs/${encodeURIComponent(runId)}/timeline?after_seq=${afterSeq}&limit=${limit}`)
