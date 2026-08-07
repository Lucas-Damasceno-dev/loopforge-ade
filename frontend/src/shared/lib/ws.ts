import type { NodeType } from './types'

// ─── Tipos de evento WS ─────────────────────────────────────────────────────
// Envelope real: {event, task_id, timestamp, **payload} (dispatcher) ou
// {event, run_id, ...} (app). Os eventos com payload (pipeline_started,
// node_execution) chegam com os campos ACHATADOS no topo — o normalize
// reconstitui o objeto `payload` esperado pelos consumidores.

export interface WsEventBase {
  event: string
  task_id?: string
  timestamp?: number
  [k: string]: unknown
}

export interface WsEventNodeExecution extends WsEventBase {
  event: 'node_execution'
  payload: { node: NodeType; status: 'completed'; next_agent?: string; attempt_count?: number }
}

export interface WsEventPipelineStarted extends WsEventBase {
  event: 'pipeline_started'
  payload: { idea: string; node: string }
}

export interface WsEventGeneric extends WsEventBase {
  event: 'run_created' | 'run_updated' | 'pipeline_finished' | 'pipeline_failed' | 'pipeline_error' | 'pipeline_resumed' | 'human_decision_expired' | 'human_decision_submitted'
}

export type WsEvent = WsEventNodeExecution | WsEventPipelineStarted | WsEventGeneric

const KNOWN = new Set([
  'pipeline_started',
  'node_execution',
  'pipeline_finished',
  'pipeline_failed',
  'pipeline_error',
  'pipeline_resumed',
  'human_decision_expired',
  'human_decision_submitted',
  'run_created',
  'run_updated',
])

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined
}

// Mapa de nomes reais do grafo LangGraph → NodeType do kanban (UX3).
// Nós reais (validados em agentes/LoopForge/src/lf/pipeline/graph.py): cpo,
// pm, tech_lead, test_writer, developer, qa, appsec, devops, parallel_audit.
// developer → dev; appsec/devops → parallel_audit (colapsados no card Parallel
// Audit). Membros da union (entry/dev/retry/...) mapeiam 1:1. Nome fora do
// mapa → null (envelope desconhecido — nunca propaga string fora da union).
const NODE_MAP: Record<string, NodeType> = {
  entry: 'entry',
  cpo: 'cpo',
  pm: 'pm',
  tech_lead: 'tech_lead',
  test_writer: 'test_writer',
  developer: 'dev',
  dev: 'dev',
  qa: 'qa',
  retry: 'retry',
  appsec: 'parallel_audit',
  devops: 'parallel_audit',
  parallel_audit: 'parallel_audit',
}

// Valida `event` conhecido e reconstrói o envelope normalizado. Retorna null
// para eventos desconhecidos, nós de nome desconhecido ou payloads inválidos.
export function normalizeWsEvent(raw: unknown): WsEvent | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.event !== 'string' || !KNOWN.has(r.event)) return null

  if (r.event === 'node_execution') {
    // Só aceita nomes de nó conhecidos (mapa acima); nome desconhecido →
    // envelope desconhecido (null). Sem cast inseguro para NodeType.
    if (typeof r.node !== 'string') return null
    const node = NODE_MAP[r.node]
    if (!node) return null
    return {
      event: 'node_execution',
      task_id: str(r.task_id),
      timestamp: num(r.timestamp),
      payload: {
        node,
        status: 'completed',
        next_agent: str(r.next_agent),
        attempt_count: num(r.attempt_count),
      },
    }
  }

  if (r.event === 'pipeline_started') {
    return {
      event: 'pipeline_started',
      task_id: str(r.task_id),
      timestamp: num(r.timestamp),
      payload: {
        idea: str(r.idea) ?? '',
        node: str(r.node) ?? '',
      },
    }
  }

  return r as unknown as WsEvent
}

// ─── Client WS com reconnect/backoff ────────────────────────────────────────

export interface WsClientOpts {
  url: string
  token?: string
  onEvent: (e: WsEvent) => void
  onStatus?: (s: 'connecting' | 'open' | 'closed' | 'error') => void
  backoffMs?: number
}

export function createWsClient(opts: WsClientOpts) {
  const backoffBase = opts.backoffMs ?? 1000
  let ws: WebSocket | null = null
  let closedByUs = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let attempt = 0

  const connect = () => {
    closedByUs = false
    const url = opts.token ? `${opts.url}${opts.url.includes('?') ? '&' : '?'}token=${encodeURIComponent(opts.token)}` : opts.url
    opts.onStatus?.('connecting')
    ws = new WebSocket(url)
    ws.onopen = () => { attempt = 0; opts.onStatus?.('open') }
    ws.onmessage = (m) => {
      try {
        const data = JSON.parse(String(m.data))
        // Pings do servidor → responder {"type":"pong"} (qualquer msg type==='ping').
        if (data?.type === 'ping') { ws?.send(JSON.stringify({ type: 'pong' })); return }
        const ev = normalizeWsEvent(data)
        if (ev) opts.onEvent(ev)
      } catch { /* frame não-JSON ignorado */ }
    }
    ws.onclose = () => {
      opts.onStatus?.('closed')
      // Reconecta só se o fechamento não foi intencional (disconnect()).
      if (closedByUs) return
      const delay = Math.min(backoffBase * 2 ** attempt, 10_000)
      attempt += 1
      timer = setTimeout(connect, delay)
    }
    ws.onerror = () => opts.onStatus?.('error')
  }

  const disconnect = () => {
    closedByUs = true
    if (timer) clearTimeout(timer)
    timer = null
    ws?.close()
    ws = null
  }

  return { connect, disconnect }
}
