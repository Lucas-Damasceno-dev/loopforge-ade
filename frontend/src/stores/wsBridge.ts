import type { WsEvent } from '../shared/lib/ws'
import { normalizeNodeName } from '../shared/lib/ws'
import type { Run, RunStatus } from '../shared/lib/types'
import { useRunsStore } from './runsStore'
import { useCanvasStore } from './canvasStore'
import { useConsoleStore } from './consoleStore'
import { useHitlGateStore } from './hitlGateStore'
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

const RUN_STATUSES: RunStatus[] = ['pending', 'queued', 'running', 'paused', 'completed', 'failed']

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

// Handler central: traduz cada evento WS NORMALIZADO (shape v1 — payload com
// os dados, run_id/timestamp no envelope) em ações das stores.
export function handleWsEvent(e: WsEvent): void {
  switch (e.event) {
    case 'node_execution': {
      const { node, next_agent, attempt_count } = e.payload
      useCanvasStore.getState().setNodeStatus(node, 'approved', attempt_count)
      // V1.1 (ADR-0007): nó concluído → promove buffer de streaming a log.
      useConsoleStore.getState().finishStream(node)
      log('info', `node completed → ${next_agent ?? ''}`, node, str(e.run_id))
      break
    }
    case 'token_delta': {
      // V1.1 (ADR-0007): streaming incremental do LLM → buffer do console
      // (acumula por nó; o flush acontece no node_execution correspondente).
      const { node, content } = e.payload
      useConsoleStore.getState().appendStream(node, content, str(e.run_id))
      break
    }
    case 'pipeline_started':
      log('info', 'pipeline started')
      break
    case 'run_created':
    case 'run_updated': {
      const id = str(e.run_id)
      if (!id) break
      const p = e.payload
      const status = toRunStatus(str(p.status))
      const idea = str(p.idea)
      const current_node = str(p.current_node)
      // patch só com campos presentes — merge preserva idea/stack da run
      // existente quando o evento (ex.: run_updated) não os traz.
      const patch: Partial<Run> & { id: string } = { id, status }
      if (idea !== undefined) patch.idea = idea
      if (current_node !== undefined) patch.current_node = current_node
      useRunsStore.getState().upsertRun(patch)
      log('info', e.event === 'run_created' ? `run created: ${idea || id}` : `run updated: ${status}`, undefined, id)
      break
    }
    case 'run_paused': {
      // Backend emite run_paused (payload {status}) quando a run pausa
      // (HITL/timeout) — reflete no status da run (badge da aba).
      const id = str(e.run_id)
      if (id) useRunsStore.getState().updateStatus(id, 'paused')
      log('warn', 'run paused', undefined, id)
      break
    }
    case 'human_decision_expired': {
      const p = e.payload
      const node = normalizeNodeName(p.node)
      const timeout = num(p.timeout_seconds)
      if (node) useCanvasStore.getState().setNodeStatus(node, 'paused')
      log('warn', `HITL decision expired (${timeout ?? '?'}s)`, node ?? 'system')
      break
    }
    case 'human_decision_submitted': {
      const p = e.payload
      const action = str(p.action) ?? '?'
      const gate_node = str(p.gate_node) ?? '?'
      log('info', `decision: ${action} on ${gate_node}`)
      break
    }
    case 'pipeline_finished': {
      // App real (app.py _execute_pipeline_in_background) envia via envelope
      // {run_id, payload: {status: 'completed'|'failed', duration_seconds}} —
      // única fonte WS da run chegar a completed/failed.
      const id = str(e.run_id)
      if (id) {
        const status = toRunStatus(str(e.payload.status)) === 'failed' ? 'failed' : 'completed'
        useRunsStore.getState().updateStatus(id, status)
      }
      log('info', 'pipeline finished', undefined, id)
      break
    }
    case 'pipeline_failed': {
      const id = str(e.run_id)
      if (id) useRunsStore.getState().updateStatus(id, 'failed')
      log('error', 'pipeline failed', undefined, id)
      break
    }
    case 'pipeline_error': {
      const id = str(e.run_id)
      if (id) useRunsStore.getState().updateStatus(id, 'failed')
      log('error', 'pipeline error', undefined, id)
      break
    }
    case 'pipeline_resumed':
      log('info', 'pipeline resumed')
      break
    case 'hitl_gate_reached': {
      // C3 (M-12): gate HITL alcançado → banner informativo não-bloqueante
      // (hitlGateStore) + log. O drawer HITL continua abrindo pelo
      // canvasStore (run_paused/node paused) — o banner é complementar.
      const p = e.payload
      useHitlGateStore.getState().push({
        gateNode: str(p.gate_node) ?? '?',
        runId: str(e.run_id),
        threadId: str(p.thread_id),
        timeoutSeconds: num(p.timeout_seconds),
        onTimeout: str(p.on_timeout),
        ts: num(p.ts),
      })
      log('warn', `HITL gate reached: ${str(p.gate_node) ?? '?'}`, 'system', str(e.run_id))
      break
    }
    case 'fork_created':
      // Fork é iniciado pela própria UI (resposta síncrona do POST) — o
      // evento de broadcast apenas confirma; nada a fazer aqui no V1.
      log('info', 'fork created', undefined, str(e.run_id))
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
