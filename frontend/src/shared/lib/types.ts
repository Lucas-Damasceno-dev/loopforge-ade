/**
 * Tipos de domínio espelhando o backend ADE real — validados em
 * agentes/LoopForge (src/lf/api/schemas.py, src/lf/api/app.py,
 * src/lf/api/{config,trajectories,mcp}.py, src/lf/config/schema.py).
 *
 * Valores reais encontrados na fonte (2026-08-06):
 * - RunResponse (schemas.py): {id, idea, stack, status, current_node: str|null,
 *   logs: str|null (STRING única — não array), duration_seconds: float,
 *   created_at, updated_at}. NÃO existe Literal RunStatus; o código grava
 *   "pending" | "running" | "completed" | "failed" (app.py; models.py default
 *   "pending"; RunUpdate menciona "done" mas nunca é gravado).
 * - Auth REST: `lf serve` SEMPRE ativa autenticação — gera token_hex(16) e
 *   imprime no log ("X-API-Key: <key>"). Origem do valor: env LF_API_API_KEY
 *   ou LF_API_KEY (src/lf/cli/commands/serve.py). O client injeta o header
 *   X-API-Key quando VITE_API_KEY está definido (api.ts).
 * - WS: /ws/streaming e /ws/runs/{run_id} exigem ?token=<mesma chave>
 *   (settings.api_key ou "secret").
 * - POST /api/runs/{run_id}/decide retorna HumanDecisionResponse — NÃO a Run.
 * - GET /api/v1/trajectories/{thread_id}/checkpoints retorna
 *   [{thread_id: string}] (objetos, não string[]).
 * - GET /api/v1/mcp/servers → [{name, status}]; tools → [{name, description,
 *   inputSchema}] (camelCase — não input_schema).
 * - POST /api/runs NÃO aceita thread_id/checkpoint (gap do plano).
 */

// Ids canônicos de EXECUÇÃO (contrato 03 §7): cpo, pm, tech_lead,
// test_writer, developer, qa, parallel_audit (appsec/devops = sub-cards de
// parallel_audit, sem nó próprio). entry/retry são VIRTUAIS de apresentação
// (presentes no canvas, sem node_execution próprio; retry deriva de
// attempt_count>0).
export type NodeType =
  | 'entry'
  | 'cpo'
  | 'pm'
  | 'tech_lead'
  | 'test_writer'
  | 'developer'
  | 'qa'
  | 'retry'
  | 'parallel_audit'

// Status da run: backend agora também emite queued (fila) e paused
// (HITL/timeout) via run_updated/run_paused e GET /api/runs.
export type RunStatus = 'pending' | 'queued' | 'running' | 'paused' | 'completed' | 'failed'

export interface Run {
  id: string
  idea: string
  stack: string
  status: RunStatus
  current_node?: string | null
  /** Thread de trajectory do backend (quando a run roda em infra real) — checkpoints da T10. */
  thread_id?: string
  logs?: string | null
  duration_seconds?: number
  created_at?: string
  updated_at?: string
  /** Modo degradado (fallback sem LLM real) — badge warn na aba da run. */
  degraded?: boolean
  /** Motivo da degradação (ex.: "mock fallback", erro do provider). */
  degraded_reason?: string | null
}

export interface RunListResponse {
  items: Run[]
  total: number
}

// ─── Fila E3 (QueueBadge) — GET /api/v1/runs/queue ──────────────────────────
// Espelha o response do engine: {max_concurrent, active_count, active, queued}.

/** Item enfileirado aguardando slot (E3 — max_concurrent). */
export interface QueueItem {
  id: string
  idea: string
  stack: string
  status: string
  created_at?: string
}

/** GET /api/v1/runs/queue — fila de execução E3. */
export interface RunQueueResponse {
  max_concurrent: number
  active_count: number
  active: string[]
  queued: QueueItem[]
}

export interface AdeBudget {
  max_usd: number
}

/** Budget efetivo de uma run (CostResponse.budget — espelha schemas.py CostBudget). */
export interface CostBudget {
  max_usd: number
  percent_used: number
}

/** Custo agrupado por nó (CostResponse.nodes — aditivo, default []). */
export interface CostNode {
  node: string
  spent_usd: number
  estimated: boolean
}

/** GET /api/v1/runs/{id}/cost (M-08/M-10) — espelha schemas.py CostResponse. */
export interface CostResponse {
  run_id: string
  spent_usd: number
  estimated: boolean
  budget: CostBudget
  budget_warning: boolean
  /** Custos por nó do DAG (Fase D/UC-04) — ausente no V1 → default []. */
  nodes?: CostNode[]
}

/** Corpo do POST /api/v1/runs/{id}/cost/override — espelha BudgetOverrideRequest. */
export interface BudgetOverrideRequest {
  max_usd: number
}

/** Corpo do POST /api/v1/runs — espelha schemas.py RunCreate. */
export interface CreateRunInput {
  idea: string
  stack?: string
  mock_llm?: boolean
  routing_mode?: string
  interactive?: boolean
  /** Modelo LLM override para a run (vence env/config por run). */
  model?: string | null
}

export interface AdeMcpServer {
  name: string
  command: string
  args: string[]
  tools_allowlist: string[]
  enabled: boolean
}

export interface AdeProviders {
  primary: string
  ollama_base_url: string
}

export interface AdeHITL {
  timeout_seconds: number
  /** C4 (M-11): comportamento ao esgotar o timeout do gate (espelha schema.py). */
  on_timeout: 'continue' | 'abort' | 'pause'
}

export interface AdeConfig {
  budget: AdeBudget
  mcp_servers: AdeMcpServer[]
  providers: AdeProviders
  hitl: AdeHITL
}

export interface Checkpoint {
  thread_id: string
  checkpoint_id: string
  state: Record<string, unknown>
}

/** Resposta real de GET /api/v1/mcp/servers (registry.py → {name, status}). */
export interface McpServer {
  name: string
  status?: string
}

/** Tool real de GET /api/v1/mcp/servers/{name}/tools (client.py → inputSchema). */
export interface McpTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

/** HumanDecisionResponse real (schemas.py) — id/timestamp incluídos. */
export interface DecisionRecord {
  id: string
  run_id: string
  gate_node: string
  action: string
  feedback_category?: string | null
  feedback_message?: string | null
  user: string
  timestamp?: string
}

// ─── Fase C — trajetórias (fork/export/import/timeline) ─────────────────────
// Espelha src/lf/api/trajectories.py e app.py (rotas /trajectories/* e
// /runs/{id}/timeline). Thread canônica de uma run é `run-{run_id}` (ADR-0003).

/** Resposta de POST /trajectories/{thread_id}/fork (201). */
export interface ForkResult {
  fork_run_id: string
  thread_id: string
  checkpoint_id: string
}

/** Resposta de POST /trajectories/import (201). */
export interface ImportResult {
  run_id: string
  thread_id: string
  checkpoints_imported: number
}

/** Export enriquecido (schema_version 1.1) — payload livre, campos de topo tipados. */
export interface TrajectoryExport {
  schema_version: string
  run_id: string
  thread_id: string
  exported_at?: string
  idea?: string
  checkpoints?: unknown[]
  steps?: unknown[]
  events?: unknown[]
  costs?: unknown
  [key: string]: unknown
}

/** Item da timeline unificada (GET /runs/{id}/timeline) — evento OU checkpoint. */
export interface TimelineEntry {
  seq: number
  type: 'event' | 'checkpoint'
  /** Epoch ms (eventos) ou string ISO (checkpoints LangGraph). */
  timestamp: number | string
  /** Nome do nó quando disponível no payload/metadata. */
  node: string | null
  /** Payload do evento OU checkpoint serializado. */
  data: Record<string, unknown>
}

/** Resposta de GET /runs/{id}/timeline?after_seq=&limit=. */
export interface TimelineResponse {
  run_id: string
  timeline: TimelineEntry[]
  total_count: number
  has_more: boolean
  next_after_seq: number | null
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}

// ─── Evals (pilar 5 — EvalsPanel) ────────────────────────────────────────────
// Espelha src/lf/api/evals.py (schemas locais do router). Telemetria nunca
// 500: backend retorna zeros/listas vazias com status ok|empty|error.

/** GET /api/v1/evals/summary — métricas agregadas de evals (runs + benchmark + ELO). */
export interface EvalsSummary {
  total_runs: number
  /** Taxa de sucesso (0.0–1.0) entre runs concluídas (completed/done vs failed). */
  pass_rate: number
  /** Duração média (s) das runs concluídas com sucesso. */
  avg_duration_seconds: number
  /** Custo total (USD) acumulado no ledger llm_costs. */
  total_cost_usd: number
  /** Total de arquivos run_*.json em .loopforge/benchmarks/. */
  benchmark_runs: number
  /** Taxa de sucesso média (0.0–1.0) das runs de benchmark. */
  avg_pass_rate: number
  /** Rating ELO atual do LoopForge (1200.0 default). */
  current_elo: number
  status: 'ok' | 'empty' | 'error'
  message?: string
}

/** Item do ranking de benchmarks (fonte: run_*.json — RunBenchmark.asdict). */
export interface EvalsLeaderboardEntry {
  run_id: string
  stack: string
  success: boolean
  duration_seconds: number
  estimated_cost_usd: number
  timestamp: string
}

/** GET /api/v1/evals/leaderboard — ranking (sucesso primeiro, mais rápido antes). */
export interface EvalsLeaderboard {
  entries: EvalsLeaderboardEntry[]
  status: 'ok' | 'empty' | 'error'
  message?: string
}

// ─── Memória (MemoryPanel) — lições aprendidas ────────────────────────────
// Espelha src/lf/api/memory.py (schemas LessonCreate/LessonUpdate/LessonResponse)
// e o MemoryManager (tabela `lessons` no telemetry.sqlite).

/** Lição aprendida devolvida pela API (GET/POST/PATCH /memory/lessons). */
export interface Lesson {
  id: number
  run_id: string
  stack: string
  idea: string
  lesson_text: string
  /** Epoch seconds (coluna REAL no SQLite). */
  created_at: number
}

/** Payload de POST /memory/lessons. */
export interface LessonCreate {
  run_id: string
  stack: string
  idea: string
  lesson_text: string
}

/** Payload de PATCH /memory/lessons/{id} — todos os campos opcionais. */
export interface LessonUpdate {
  stack?: string
  idea?: string
  lesson_text?: string
}

/** Resposta de DELETE /memory/lessons/{id}. */
export interface LessonDeleteResult {
  deleted: boolean
}

// ─── Git (GitPanel) — espelha src/lf/api/git.py ───────────────────────────
// GET /api/v1/git/{run_id}: branch, HEAD, status curto (git status --short)
// e log de commits (máx. 20) do repositório da run. 404 quando o diretório
// da run não existe ou não é repositório git.

/** Arquivo alterado no working tree (estilo git status --short). */
export interface GitStatusEntry {
  path: string
  status: string
}

/** Um commit do histórico (máx. 20). */
export interface GitLogEntry {
  hash: string
  subject: string
  author: string
  /** Data do commit em ISO 8601. */
  when: string
}

/** GET /api/v1/git/{run_id} — estado do repositório git da run. */
export interface GitInfo {
  branch: string | null
  head: string | null
  status: GitStatusEntry[]
  log: GitLogEntry[]
}

// ─── Health (HealthPanel) — espelha schemas.py HealthResponse ──────────────
// GET /health (sem auth): {status, version} — usado no polling do HealthPanel.

/** GET /health — status do engine (ok) + versão. */
export interface HealthStatus {
  status: string
  version: string
}

// ─── Artifacts (InspectDrawer real) — GET /api/v1/runs/{id}/artifacts ─────
// Espelha src/lf/api/schemas.py (ArtifactsResponse, ArtifactTokens,
// NodeArtifact, CircuitBreakerSnapshot, ArtifactLesson).

/** Tokens + custo LLM agregados por nó (tabela llm_costs). */
export interface ArtifactTokens {
  node: string
  model?: string | null
  prompt_tokens: number
  completion_tokens: number
  cost_usd: number
  estimated: boolean
}

/** Output de um nó do DAG (canais do último checkpoint). */
export interface NodeArtifact {
  output: Record<string, unknown>
}

/** Snapshot serializável do CircuitBreaker (canal circuit_breaker). */
export interface CircuitBreakerSnapshot {
  state?: string | null
  consecutive_failures: number
  total_iterations: number
  total_cost: number
  max_consecutive_failures?: number | null
  max_iterations?: number | null
  max_total_cost?: number | null
  cost_per_iteration?: number | null
  reset_timeout?: number | null
  last_failure_time?: number | null
}

/** Lição aprendida associada à run (tabela lessons). */
export interface ArtifactLesson {
  id: number
  run_id: string
  lesson_text: string
  created_at: number
}

export interface ArtifactsResponse {
  run_id: string
  node_artifacts: Record<string, NodeArtifact>
  tokens: ArtifactTokens[]
  degraded: boolean
  degraded_reason?: string | null
  circuit_breaker?: CircuitBreakerSnapshot | null
  lessons: ArtifactLesson[]
}

/** Arquivo gerado no diretório de saída da run (GET /runs/{id}/files). */
export interface RunFileItem {
  path: string
  size: number
  content: string | null
  is_binary: boolean
}

/** Resposta de GET /runs/{id}/files. */
export interface RunFilesResponse {
  run_id: string
  files: RunFileItem[]
}

// ─── Terminal & Command Runner ──────────────────────────────────────
export interface ExecCommandResponse {
  run_id: string
  command: string
  stdout: string
  stderr: string
  exit_code: number
  duration_seconds: number
}

export interface TerminalInfoResponse {
  run_id: string
  workspace_path: string | null
  exists: boolean
}

// ─── AST & Dependency Analysis ─────────────────────────────────────
export interface AstSymbolInfo {
  name: string
  kind: string
  line_number: number
  docstring?: string | null
}

export interface AstModuleInfo {
  file_path: string
  language: string
  total_lines: number
  symbols: AstSymbolInfo[]
  imports: string[]
}

export interface AstEdge {
  source_file: string
  target_module: string
  import_type: string
}

export interface AstAnalysisResponse {
  run_id: string
  modules: AstModuleInfo[]
  external_packages: string[]
  dependency_graph: AstEdge[]
}

// ─── Code Coverage ─────────────────────────────────────────────────
export interface FileCoverageItem {
  file_path: string
  total_lines: number
  covered_lines: number
  missed_lines: number
  percentage: number
}

export interface CoverageReportResponse {
  run_id: string
  total_lines: number
  covered_lines: number
  coverage_percentage: number
  files: FileCoverageItem[]
  source: string
}

// ─── Docker & Devcontainer ─────────────────────────────────────────
export interface DockerConfigResponse {
  run_id: string
  stack: string
  base_image: string
  dockerfile: string
  docker_compose: string
  devcontainer: string
  dockerignore: string
  suggested_ports: number[]
  environment_vars: Record<string, string>
}

export interface SaveDockerConfigRequest {
  dockerfile?: string | null
  docker_compose?: string | null
  devcontainer?: string | null
  dockerignore?: string | null
}

export interface SaveDockerConfigResponse {
  run_id: string
  success: boolean
  saved_files: string[]
  message: string
}



