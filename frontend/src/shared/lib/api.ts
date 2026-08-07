import type { AdeConfig, Checkpoint, DecisionRecord, DeepPartial, McpServer, McpTool, Run, RunListResponse } from './types'

// Base da API: VITE_API_BASE opcional (ex.: http://127.0.0.1:8787) — default '/api'
// (no dev, o Vite faz proxy de /api → backend real em 127.0.0.1:8787).
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api'
// X-API-Key opcional: o `lf serve` ativa autenticação sempre (chave impressa
// no log; origem LF_API_API_KEY / LF_API_KEY). Sem VITE_API_KEY, envia sem header.
const API_KEY = import.meta.env.VITE_API_KEY as string | undefined

export class ApiError extends Error {
  constructor(public status: number, public detail: unknown) {
    super(`API ${status}: ${JSON.stringify(detail)}`)
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) }
  if (init.body) headers['Content-Type'] = 'application/json'
  if (API_KEY) headers['X-API-Key'] = API_KEY
  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    let detail: unknown = null
    try { detail = (await res.json()).detail } catch { /* corpo não-JSON (ex.: 401 com WWW-Authenticate) */ }
    throw new ApiError(res.status, detail)
  }
  return res.json() as Promise<T>
}

export const listRuns = (skip = 0, limit = 50) => apiFetch<RunListResponse>(`/runs?skip=${skip}&limit=${limit}`)
export const getRun = (id: string) => apiFetch<Run>(`/runs/${id}`)
export const createRun = (idea: string) => apiFetch<Run>('/runs', { method: 'POST', body: JSON.stringify({ idea }) })
export const resumeRun = (id: string) => apiFetch<Run>(`/runs/${id}/resume`, { method: 'POST' })
export const getDecisions = (id: string) => apiFetch<DecisionRecord[]>(`/runs/${id}/decisions`)
// Decide retorna a decisão gravada (HumanDecisionResponse) — não a Run.
export const decideRun = (id: string, body: Record<string, unknown>) => apiFetch<DecisionRecord>(`/runs/${id}/decide`, { method: 'POST', body: JSON.stringify(body) })
export const getConfig = () => apiFetch<AdeConfig>('/v1/config')
export const patchConfig = (partial: DeepPartial<AdeConfig>) => apiFetch<AdeConfig>('/v1/config', { method: 'PATCH', body: JSON.stringify(partial) })
export const listMcpServers = () => apiFetch<McpServer[]>('/v1/mcp/servers')
export const listMcpTools = (name: string) => apiFetch<McpTool[]>(`/v1/mcp/servers/${encodeURIComponent(name)}/tools`)
// O backend retorna [{thread_id}] para a listagem de checkpoints de uma thread.
export const getCheckpoints = (threadId: string) => apiFetch<Array<{ thread_id: string }>>(`/v1/trajectories/${encodeURIComponent(threadId)}/checkpoints`)
export const getCheckpoint = (threadId: string, checkpointId: string) => apiFetch<Checkpoint>(`/v1/trajectories/${encodeURIComponent(threadId)}/checkpoints/${encodeURIComponent(checkpointId)}`)
