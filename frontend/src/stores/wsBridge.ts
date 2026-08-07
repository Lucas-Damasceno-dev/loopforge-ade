import type { WsEvent } from '../shared/lib/ws'
import { normalizeNodeName } from '../shared/lib/ws'
import type { Run, RunStatus } from '../shared/lib/types'
import { useRunsStore } from './runsStore'
import { useCanvasStore } from './canvasStore'
import { useConsoleStore } from './consoleStore'
import type { ConsoleEntry, LogLevel } from './consoleStore'

// Barramento de eventos WS: stores de features registram handlers aqui
// (canvasStore na Task 6, consoleStore na Task 8) e o wsStore despacha.
let handlers: ((e: WsEvent) => void)[] = []

export function registerWsHandler(f: (e: WsEvent) => void): () => void {
  handlers.push(f)
  return () => {
    handlers = handlers.filter((h) => h !== f)
  }
}

export function dispatchWsEvent(e: WsEvent): void {
  handlers.forEach((h) => h(e))
}

// ─── Mapeamento WS → stores (T5) ────────────────────────────────────────────
// O wiring registra UM handler em setupWsBridge() (guard com flag module-level
// para StrictMode/HMR não registrar duas vezes). As stores ficam puras; o
// mapeamento mora aqui para funcionar tanto com WS real quanto com dispatch
// sintético (mock da T7).

const RUN_STATUSES: RunStatus[] = ['pending', 'running', 'completed', 'failed']

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined
}

function toRunStatus(v: unknown): RunStatus {
  return typeof v === 'string' && (RUN_STATUSES as string[]).includes(v) ? (v as RunStatus) : 'pending'
}

let entrySeq = 0
function makeEntry(partial: Omit<ConsoleEntry, 'id' | 'ts'>): ConsoleEntry {
  entrySeq += 1
  return { id: `ws-${entrySeq}-${Date.now()}`, ts: Date.now(), ...partial }
}

function log(level: LogLevel, message: string, node?: ConsoleEntry['node'], runId?: string) {
  useConsoleStore.getState().addEntry(makeEntry({ level, message, node, runId }))
}

// Handler central: traduz cada evento WS normalizado em ações das stores.
export function handleWsEvent(e: WsEvent): void {
  switch (e.event) {
    case 'node_execution': {
      const { node, next_agent, attempt_count } = e.payload
      useCanvasStore.getState().setNodeStatus(node, 'approved', attempt_count)
      log('info', `node completed → ${next_agent ?? ''}`, node)
      break
    }
    case 'pipeline_started':
      log('info', 'pipeline started')
      break
    case 'run_created':
    case 'run_updated': {
      const id = str(e.run_id)
      if (!id) break
      const status = toRunStatus(str(e.status))
      const idea = str(e.idea)
      const current_node = str(e.current_node)
      // patch só com campos presentes — merge preserva idea/stack da run
      // existente quando o evento (ex.: run_updated) não os traz.
      const patch: Partial<Run> & { id: string } = { id, status }
      if (idea !== undefined) patch.idea = idea
      if (current_node !== undefined) patch.current_node = current_node
      useRunsStore.getState().upsertRun(patch)
      log('info', e.event === 'run_created' ? `run created: ${idea || id}` : `run updated: ${status}`, undefined, id)
      break
    }
    case 'human_decision_expired': {
      const node = normalizeNodeName(e.node)
      const timeout = num(e.timeout_seconds)
      if (node) useCanvasStore.getState().setNodeStatus(node, 'paused')
      log('warn', `HITL decision expired (${timeout ?? '?'}s)`, node ?? 'system')
      break
    }
    case 'human_decision_submitted': {
      const action = str(e.action) ?? '?'
      const gate_node = str(e.gate_node) ?? '?'
      log('info', `decision: ${action} on ${gate_node}`)
      break
    }
    case 'pipeline_finished':
      log('info', 'pipeline finished')
      break
    case 'pipeline_failed':
      log('error', 'pipeline failed')
      break
    case 'pipeline_error':
      log('error', 'pipeline error')
      break
    case 'pipeline_resumed':
      log('info', 'pipeline resumed')
      break
  }
}

// Registra o handler único. Guard com flag module-level: chamadas repetidas
// (StrictMode double-invoke, HMR) são no-ops.
let wired = false
export function setupWsBridge(): void {
  if (wired) return
  wired = true
  registerWsHandler(handleWsEvent)
}

// Wiring automático: importar wsBridge já ativa o mapeamento (testes do brief
// chamam dispatchWsEvent sem setup explícito).
setupWsBridge()
