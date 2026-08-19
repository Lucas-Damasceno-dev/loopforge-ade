import type {
  AdeConfig,
  Agent,
  AgentInput,
  ArtifactsResponse,
  AstAnalysisResponse,
  AuthMe,
  BudgetOverrideRequest,
  Checkpoint,
  CostResponse,
  CoverageReportResponse,
  CreateRunInput,
  DecisionRecord,
  DeepPartial,
  DockerConfigResponse,
  EvalsLeaderboard,
  EvalsSummary,
  ExecCommandResponse,
  ForkResult,
  GitInfo,
  HealthStatus,
  ImportResult,
  Lesson,
  LessonCreate,
  LessonDeleteResult,
  McpServer,
  McpTool,
  Pipeline,
  PipelineInput,
  Run,
  RunFilesResponse,
  RunListResponse,
  RunQueueResponse,
  SaveDockerConfigRequest,
  SaveDockerConfigResponse,
  TerminalInfoResponse,
  TimelineResponse,
  TrajectoryExport,
  ValidateResult,
} from './types'
import type { WsEvent } from './ws'

// Base da API v1: VITE_API_BASE opcional (ex.: http://127.0.0.1:8787) —
// default '/api/v1' (no dev, o Vite faz proxy de /api → backend real).
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api/v1'

// Chave de API (B2/M-20): lida de localStorage 'lf_api_key' (tela 401) com
// fallback para VITE_API_KEY (env de build). Sem chave, envia sem header.
const KEY_STORAGE = 'lf_api_key'

// Sanitização (431 fix): key poluída (ex.: texto colado no campo de login)
// vira header X-API-Key gigante → servidor responde 431 Request Header Fields
// Too Large → ERR_TOO_MANY_RETRIES no browser. Qualquer valor acima do limite
// é ignorado (e removido do storage) — o gate reabre e o usuário digita a key
// real. Keys reais (hex/token) têm < 100 chars.
const MAX_KEY_LENGTH = 256

export function getApiKey(): string | undefined {
  try {
    const stored = localStorage.getItem(KEY_STORAGE)
    if (stored && stored.length <= MAX_KEY_LENGTH) return stored
    if (stored && stored.length > MAX_KEY_LENGTH) localStorage.removeItem(KEY_STORAGE)
  } catch {
    /* storage indisponível (teste/privacy) */
  }
  const env = import.meta.env.VITE_API_KEY as string | undefined
  return env && env.length <= MAX_KEY_LENGTH ? env : undefined
}

export function setApiKey(key: string): void {
  const clean = key.trim().slice(0, MAX_KEY_LENGTH)
  if (!clean) return
  try { localStorage.setItem(KEY_STORAGE, clean) } catch { /* storage indisponível (teste/privacy) */ }
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
  // Erro de REDE (backend down, DNS, AbortError): o fetch cru rejeita com
  // TypeError "Failed to fetch" — embrulha em ApiError legível p/ o caller
  // exibir (boot/resume usam .detail). status 0 = sem resposta HTTP.
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers })
  } catch {
    throw new ApiError(0, 'Engine inacessível — verifique se o backend está rodando')
  }

  if (res.status === 401) {
    // Enfileira a chamada pendente; o caller continua aguardando até o retry.
    return new Promise<T>((resolve, reject) => {
      retryQueue.push({ path, init, resolve: resolve as (v: unknown) => void, reject })
      unauthorizedListeners.forEach((fn) => fn())
    })
  }

  if (res.status === 429) {
    // Rate limit (rate_limit.py): hint acionável com Retry-After (segundos)
    // quando presente — a UI que mostra ApiError.detail exibe junto.
    const retryAfter = res.headers.get('retry-after')
    const wait = retryAfter ? parseInt(retryAfter, 10) : NaN
    const hint =
      Number.isFinite(wait) && wait > 0
        ? `Muitas requisições — aguarde ${wait}s antes de tentar de novo`
        : 'Muitas requisições — aguarde um instante e tente de novo'
    throw new ApiError(429, hint)
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
// Run única (A2 — HitlDrawer recarrega o estado real após decisão/rejeição):
// GET /runs/{id} → RunResponse (status/current_node/degraded atualizados).
export const getRun = (id: string) => apiFetch<Run>(`/runs/${encodeURIComponent(id)}`)
// Fila E3 (QueueBadge): GET /runs/queue → {max_concurrent, active_count, active, queued}.
export const getRunQueue = () => apiFetch<RunQueueResponse>('/runs/queue')
export const createRun = (input: CreateRunInput) =>
  apiFetch<Run>('/runs', {
    method: 'POST',
    // A3: `interactive` NÃO é mais forçado aqui — o NewRunForm decide via
    // checkbox (HITL). mock_llm segue default false (produção real).
    body: JSON.stringify({ mock_llm: false, ...input }),
  })
export const resumeRun = (id: string) => apiFetch<Run>(`/runs/${id}/resume`, { method: 'POST' })
// Cancelar run (item 1): POST /runs/{id}/cancel — queued remove da fila,
// running/paused cancela a task; completed/failed → 409 "run not cancellable"
// (vira ApiError de negócio — a UI mostra a mensagem sem quebrar). O status
// final chega via WS run_updated (wsBridge); o client ainda faz upsert local
// como fallback quando o evento não chega.
export const cancelRun = (id: string) => apiFetch<Run>(`/runs/${encodeURIComponent(id)}/cancel`, { method: 'POST' })
export const getDecisions = (id: string) => apiFetch<DecisionRecord[]>(`/runs/${id}/decisions`)
// Decide retorna a decisão gravada (HumanDecisionResponse) — não a Run.
export const decideRun = (id: string, body: Record<string, unknown>) => apiFetch<DecisionRecord>(`/runs/${id}/decide`, { method: 'POST', body: JSON.stringify(body) })

// Custos (M-08/M-10): GET /api/v1/runs/{id}/cost e POST .../cost/override.
export const getRunCost = (id: string) => apiFetch<CostResponse>(`/runs/${id}/cost`)
export const overrideRunBudget = (id: string, body: BudgetOverrideRequest) =>
  apiFetch<CostResponse>(`/runs/${id}/cost/override`, { method: 'POST', body: JSON.stringify(body) })

// Artifacts por nó (InspectDrawer real): GET /api/v1/runs/{id}/artifacts —
// último checkpoint (canais de artefato) + llm_costs (tokens) + lessons.
export const getRunArtifacts = (id: string) => apiFetch<ArtifactsResponse>(`/runs/${encodeURIComponent(id)}/artifacts`)

// Arquivos gerados no diretório da run: GET /api/v1/runs/{id}/files
export const getRunFiles = (id: string) => apiFetch<RunFilesResponse>(`/runs/${encodeURIComponent(id)}/files`)

// Export ZIP de uma run: GET /api/v1/runs/{id}/export
export async function downloadRunZip(id: string): Promise<void> {
  const headers: Record<string, string> = {}
  const key = getApiKey()
  if (key) headers['X-API-Key'] = key
  const res = await fetch(`${BASE}/runs/${encodeURIComponent(id)}/export`, { headers })
  if (!res.ok) {
    throw new ApiError(res.status, 'Failed to download run zip')
  }
  const blob = await res.blob()
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `loopforge-run-${id.slice(0, 8)}.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

export const getConfig = () => apiFetch<AdeConfig>('/config')
export const patchConfig = (partial: DeepPartial<AdeConfig>) => apiFetch<AdeConfig>('/config', { method: 'PATCH', body: JSON.stringify(partial) })
export const listMcpServers = () => apiFetch<McpServer[]>('/mcp/servers')
export const listMcpTools = (name: string) => apiFetch<McpTool[]>(`/mcp/servers/${encodeURIComponent(name)}/tools`)
export const publishGitPr = (runId: string, payload?: { title?: string; body?: string }) =>
  apiFetch<{ success: boolean; message: string; branch: string; pr_url?: string }>(
    `/git/${encodeURIComponent(runId)}/publish-pr`,
    {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    },
  )

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

// Backfill de eventos (E4): GET /runs/{run_id}/events?after_seq=&limit= —
// eventos normalizados v1 (mesmo shape do WS) desde after_seq+1. Usado no
// reconnect do WS para preencher o gap de eventos perdidos durante a queda.
export const getRunEvents = (runId: string, afterSeq = 0, limit = 200) =>
  apiFetch<{ run_id: string; events: WsEvent[]; next_after_seq: number | null }>(
    `/runs/${encodeURIComponent(runId)}/events?after_seq=${afterSeq}&limit=${limit}`,
  )

// ─── Evals (pilar 5 — EvalsPanel) ────────────────────────────────────────────
// Telemetria de benchmarks/ELO da engine (lf/api/evals.py). Telemetria nunca
// 500: backend responde zeros + status empty/error quando não há dados.
export const getEvalsSummary = () => apiFetch<EvalsSummary>('/evals/summary')
export const getEvalsLeaderboard = () => apiFetch<EvalsLeaderboard>('/evals/leaderboard')

// ─── Memória (MemoryPanel) — lições aprendidas ───────────────────────────────
// CRUD de lições em /api/v1/memory/lessons (src/lf/api/memory.py). GET lista
// com filtros opcionais stack/query/limit (default 50); busca com query reusa
// o ranqueamento por relevância do backend e retorna ordenada por created_at.
export const listLessons = (params: { stack?: string; query?: string; limit?: number } = {}) => {
  const search = new URLSearchParams()
  if (params.stack) search.set('stack', params.stack)
  if (params.query) search.set('query', params.query)
  if (params.limit !== undefined) search.set('limit', String(params.limit))
  const qs = search.toString()
  return apiFetch<Lesson[]>(`/memory/lessons${qs ? `?${qs}` : ''}`)
}
export const createLesson = (input: LessonCreate) =>
  apiFetch<Lesson>('/memory/lessons', { method: 'POST', body: JSON.stringify(input) })
export const deleteLesson = (id: number) =>
  apiFetch<LessonDeleteResult>(`/memory/lessons/${id}`, { method: 'DELETE' })

// ─── Git (GitPanel) — estado do repositório da run ──────────────────────────
// GET /api/v1/git/{run_id} (src/lf/api/git.py): branch, HEAD, status curto e
// log de commits do workdir da run (/tmp/loopforge/run_{run_id} no backend).
export const getGitInfo = (runId: string) => apiFetch<GitInfo>(`/git/${encodeURIComponent(runId)}`)

// ─── Terminal (TerminalPanel) ───────────────────────────────────────────────
export const getTerminalInfo = (runId: string) =>
  apiFetch<TerminalInfoResponse>(`/terminal/${encodeURIComponent(runId)}/info`)

export const execTerminalCommand = (runId: string, command: string, timeoutSeconds = 15) =>
  apiFetch<ExecCommandResponse>(`/terminal/${encodeURIComponent(runId)}/exec`, {
    method: 'POST',
    body: JSON.stringify({ command, timeout_seconds: timeoutSeconds }),
  })

// ─── AST & Grafo de Dependências (AstPanel) ─────────────────────────────────
export const getRunAst = (runId: string) =>
  apiFetch<AstAnalysisResponse>(`/ast/${encodeURIComponent(runId)}`)

// ─── Cobertura de Testes (CoveragePanel) ────────────────────────────────────
export const getRunCoverage = (runId: string) =>
  apiFetch<CoverageReportResponse>(`/coverage/${encodeURIComponent(runId)}`)

// ─── Docker & Devcontainer (DockerPanel) ────────────────────────────────────
export const getDockerConfig = (runId: string) =>
  apiFetch<DockerConfigResponse>(`/docker/${encodeURIComponent(runId)}`)

export const saveDockerConfig = (runId: string, payload: SaveDockerConfigRequest) =>
  apiFetch<SaveDockerConfigResponse>(`/docker/${encodeURIComponent(runId)}/save`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })

// ─── Agents (S2) — CRUD /api/v1/agents (src/lf/api/agents.py) ──────────────
export const listAgents = () => apiFetch<Agent[]>('/agents')
export const getAgent = (id: string) => apiFetch<Agent>(`/agents/${encodeURIComponent(id)}`)
// createAgent aceita Partial (C8): o form omite campos vazios/opcionais —
// backend aplica defaults e valida (timeout ge=1, temperature le=2).
export const createAgent = (input: Partial<AgentInput>) =>
  apiFetch<Agent>('/agents', { method: 'POST', body: JSON.stringify(input) })
export const updateAgent = (id: string, input: Partial<AgentInput>) =>
  apiFetch<Agent>(`/agents/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) })
export const deleteAgent = (id: string) =>
  apiFetch<void>(`/agents/${encodeURIComponent(id)}`, { method: 'DELETE' })

// ─── Pipelines (S3) — CRUD /api/v1/pipelines (src/lf/api/pipelines.py) ──────
export const listPipelines = () => apiFetch<Pipeline[]>('/pipelines')
export const getPipeline = (id: string) => apiFetch<Pipeline>(`/pipelines/${encodeURIComponent(id)}`)
export const createPipeline = (input: PipelineInput) =>
  apiFetch<Pipeline>('/pipelines', { method: 'POST', body: JSON.stringify(input) })
// PATCH-style parcial (PUT): backend mescla os campos enviados.
export const updatePipeline = (id: string, input: Partial<PipelineInput>) =>
  apiFetch<Pipeline>(`/pipelines/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) })
export const deletePipeline = (id: string) =>
  apiFetch<void>(`/pipelines/${encodeURIComponent(id)}`, { method: 'DELETE' })
// Validação estrutural: 200 {valid, errors} — não lança em pipeline inválido.
export const validatePipeline = (id: string) =>
  apiFetch<ValidateResult>(`/pipelines/${encodeURIComponent(id)}/validate`, { method: 'POST' })

// ─── Health (HealthPanel) — heartbeat do engine ─────────────────────────────
// GET /health (raiz, SEM auth — fora do prefixo /api/v1): {status, version}.
// Usado no polling do HealthPanel (10s); falha → panel mostra unreachable.
// fetch direto (não apiFetch): endpoint não exige X-API-Key nem prefixo v1.
export async function getHealth(): Promise<HealthStatus> {
  const res = await fetch('/health', { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    throw new ApiError(res.status, 'Health check failed')
  }
  return (await res.json()) as HealthStatus
}

// ─── Auth (RBAC) — GET /api/v1/auth/me ─────────────────────────────────────
// Identidade do principal (name + roles) para o login da SPA. 401 → retry
// queue padrão (o gate reabre); auth desativada → anonymous/admin.
export const getAuthMe = () => apiFetch<AuthMe>('/auth/me')
