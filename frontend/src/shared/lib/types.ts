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
}

export interface RunListResponse {
  items: Run[]
  total: number
}

export interface AdeBudget {
  max_usd: number
}

/** Budget efetivo de uma run (CostResponse.budget — espelha schemas.py CostBudget). */
export interface CostBudget {
  max_usd: number
  percent_used: number
}

/** GET /api/v1/runs/{id}/cost (M-08/M-10) — espelha schemas.py CostResponse. */
export interface CostResponse {
  run_id: string
  spent_usd: number
  estimated: boolean
  budget: CostBudget
  budget_warning: boolean
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

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}
