// Cliente da API de trajetórias para time-travel profundo (diff de checkpoints).
// Módulo auto-contido: NÃO importa api.ts nem types.ts (lanes donos daqueles
// arquivos). Espelha o contrato de:
//   GET /api/v1/trajectories/{thread}/diff?from=&to=
//   GET /api/v1/trajectories/{thread}/checkpoints?detail=1
// Reusa a mesma convenção do api.ts (BASE via VITE_API_BASE, X-API-Key de
// localStorage 'lf_api_key' com fallback VITE_API_KEY) sem depender do gate
// de 401 — modo demo segue sem header.

export interface TrajectoryDiffChanged {
  key: string
  before: string
  after: string
}

// Resposta de GET /trajectories/{thread}/diff — previews JSON-safe (string,
// truncados em ~500 chars no backend) para não estourar o payload.
export interface TrajectoryDiff {
  thread_id: string
  from: string
  to: string
  added: Record<string, string>
  removed: Record<string, string>
  changed: TrajectoryDiffChanged[]
}

// Item de GET /trajectories/{thread}/checkpoints?detail=1 (metadados mínimos
// p/ a UI de seleção do diff: id, parent, ts, step, node).
export interface TrajectoryCheckpoint {
  thread_id: string
  checkpoint_id: string
  parent_checkpoint_id: string | null
  ts: string | null
  step: number | null
  node: string | null
}

// Erro da API de trajetórias com shape {status, detail} — duck-typed pelo
// trajectoryErrorMessage (features/trajectories/errorMsg.ts).
export class TrajectoryApiError extends Error {
  constructor(public status: number, public detail: unknown) {
    super(`Trajectory API ${status}: ${JSON.stringify(detail)}`)
  }
}

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api/v1'
const KEY_STORAGE = 'lf_api_key'

function apiKey(): string | undefined {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? (import.meta.env.VITE_API_KEY as string | undefined)
  } catch {
    return import.meta.env.VITE_API_KEY as string | undefined
  }
}

async function trajectoryFetch<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {}
  const key = apiKey()
  if (key) headers['X-API-Key'] = key
  const res = await fetch(`${BASE}${path}`, { headers })
  if (!res.ok) {
    let detail: unknown = null
    try {
      detail = (await res.json()).detail
    } catch {
      /* corpo não-JSON (ex.: 401 com WWW-Authenticate) */
    }
    throw new TrajectoryApiError(res.status, detail)
  }
  return res.json() as Promise<T>
}

/** Diff estruturado entre dois checkpoints (GET /trajectories/{thread}/diff). */
export function getTrajectoryDiff(threadId: string, from: string, to: string): Promise<TrajectoryDiff> {
  const qs = new URLSearchParams({ from, to })
  return trajectoryFetch<TrajectoryDiff>(
    `/trajectories/${encodeURIComponent(threadId)}/diff?${qs.toString()}`,
  )
}

/** Metadados dos checkpoints da thread em ordem cronológica (?detail=1). */
export function getTrajectoryCheckpoints(threadId: string): Promise<TrajectoryCheckpoint[]> {
  return trajectoryFetch<TrajectoryCheckpoint[]>(
    `/trajectories/${encodeURIComponent(threadId)}/checkpoints?detail=1`,
  )
}
