import type { NodeType } from './types'

// ─── Tipos de evento WS ─────────────────────────────────────────────────────
// Envelope v1 (EventBus do backend): {seq, event, run_id, timestamp, payload}.
// `event` é o tipo; `payload` carrega os dados do evento (incl. task_id quando
// aplicável). Fallback legado (dispatcher): {event, task_id, timestamp,
// **payload} com os campos do evento ACHATADOS no topo — o normalize
// reconstitui SEMPRE o shape v1 (payload como objeto, task_id movido para
// dentro do payload).

export interface WsEventBase {
  event: string
  /** Sequência por run (v1 — ordenação/recuperação; não consumida na UI). */
  seq?: number
  /** run_id: uuid do backend (presente em todos os eventos v1). */
  run_id?: string
  /** Timestamp ISO 8601 do backend (string — events.py emite ISO, não epoch). */
  timestamp?: string
  payload: Record<string, unknown>
}

export interface WsEventNodeExecution extends WsEventBase {
  event: 'node_execution'
  payload: {
    node: NodeType
    status: 'completed'
    next_agent?: string
    attempt_count?: number
    task_id?: string
  }
}

export interface WsEventPipelineStarted extends WsEventBase {
  event: 'pipeline_started'
  payload: { idea: string; node: string; task_id?: string }
}

// C3 (M-12): gate HITL alcançado — a run pausa aguardando decisão. Payload:
// {gate_node, thread_id, run_id, timeout_seconds, on_timeout, ts}.
export interface WsEventHitlGate extends WsEventBase {
  event: 'hitl_gate_reached'
  payload: {
    gate_node: string
    thread_id?: string
    timeout_seconds?: number
    on_timeout?: string
    ts?: number
    task_id?: string
  }
}

// V1.1 (ADR-0007): streaming token a token do LLM → console. `content` é um
// chunk INCREMENTAL (não cumulativo); o frontend acumula por nó até o
// node_execution correspondente (flush). Mesmas regras de seq/run_id dos
// demais eventos (envelope v1).
export interface WsEventTokenDelta extends WsEventBase {
  event: 'token_delta'
  payload: {
    node: NodeType
    content: string
    task_id?: string
  }
}

export interface WsEventGeneric extends WsEventBase {
  event:
    | 'run_created'
    | 'run_updated'
    | 'pipeline_finished'
    | 'pipeline_failed'
    | 'pipeline_error'
    | 'pipeline_resumed'
    | 'human_decision_expired'
    | 'human_decision_submitted'
    | 'fork_created'
    | 'circuit_breaker_changed'
}

export type WsEvent =
  | WsEventNodeExecution
  | WsEventPipelineStarted
  | WsEventHitlGate
  | WsEventTokenDelta
  | WsEventGeneric

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
  // NOTA: 'run_paused' não existe (backend nunca emitiu — o pausado real vem
  // de hitl_gate_reached). Evento fora do KNOWN → normalize retorna null.
  'hitl_gate_reached',
  'fork_created',
  'token_delta',
  'circuit_breaker_changed',
])

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined
}

// Mapa de nomes reais do grafo LangGraph → NodeType do kanban (UX3).
// Nós de execução (validadas em agentes/LoopForge/src/lf/pipeline/graph.py):
// cpo, pm, tech_lead, test_writer, developer, qa, parallel_audit. `dev` é
// alias legado → developer (id canônico). entry/retry mapeiam 1:1 (virtuais
// de apresentação). appsec/devops NÃO estão no mapa: são sub-cards de
// parallel_audit sem nó próprio (contrato 03 §7). Nome fora do mapa → null.
const NODE_MAP: Record<string, NodeType> = {
  entry: 'entry',
  cpo: 'cpo',
  pm: 'pm',
  tech_lead: 'tech_lead',
  test_writer: 'test_writer',
  developer: 'developer',
  dev: 'developer', // alias legado → canônico
  qa: 'qa',
  retry: 'retry',
  parallel_audit: 'parallel_audit',
}

// Nós que emitem node_execution (contrato 03 §7). entry/retry são virtuais
// (sem evento próprio); appsec/devops são sub-cards (sem evento próprio).
// Inclui o alias legado `dev`.
const EXECUTION_NODES: ReadonlySet<string> = new Set([
  'cpo',
  'pm',
  'tech_lead',
  'test_writer',
  'developer',
  'dev',
  'qa',
  'parallel_audit',
])

// Normaliza um nome de nó arbitrário (ex.: vindo de eventos genéricos
// pass-through como human_decision_expired) para NodeType. Nome desconhecido
// ou não-string → null (nunca propaga string fora da union).
export function normalizeNodeName(name: unknown): NodeType | null {
  if (typeof name !== 'string') return null
  return NODE_MAP[name] ?? null
}

// Valida `event` conhecido e reconstrói o envelope NORMALIZADO (shape v1):
// {seq, event, run_id, timestamp, payload}. Aceita v1 e o formato legado
// (campos ACHATADOS no topo) — o resultado é sempre v1. Retorna null para
// eventos desconhecidos, nós de nome desconhecido ou payloads inválidos.
export function normalizeWsEvent(raw: unknown): WsEvent | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.event !== 'string' || !KNOWN.has(r.event)) return null

  // Envelope v1 tem `payload`; legado não — neste caso snapshot dos campos
  // top-level como payload (removendo os campos do próprio envelope).
  const hasPayload = r.payload !== undefined
  const payload: Record<string, unknown> =
    hasPayload && typeof r.payload === 'object' && r.payload !== null
      ? (r.payload as Record<string, unknown>)
      : { ...r }
  if (!hasPayload) {
    delete payload.event
    delete payload.seq
    delete payload.run_id
    delete payload.timestamp
  }

  // task_id: NO v1 vive dentro do payload; no legado, no topo. Normaliza
  // sempre para dentro do payload.
  const taskId = str(hasPayload ? payload.task_id : r.task_id)
  // timestamp é string ISO (backend) — preserva; seq continua numérico (drops
  // strings que viriam de payload legado).
  const { seq, run_id, timestamp } = { seq: num(r.seq), run_id: str(r.run_id), timestamp: str(r.timestamp) }

  if (r.event === 'node_execution') {
    // Só aceita nós de EXECUÇÃO (entry/retry/appsec/devops não têm evento
    // próprio — contrato 03 §7). Nome desconhecido → envelope desconhecido
    // (null). Sem cast inseguro para NodeType.
    const rawNode = str(payload.node)
    if (!rawNode) return null
    const node = normalizeNodeName(rawNode)
    if (!node || !EXECUTION_NODES.has(rawNode)) return null
    const p: WsEventNodeExecution['payload'] = {
      node,
      status: 'completed',
      next_agent: str(payload.next_agent),
      attempt_count: num(payload.attempt_count),
    }
    if (taskId !== undefined) p.task_id = taskId
    return { event: 'node_execution', seq, run_id, timestamp, payload: p }
  }

  if (r.event === 'pipeline_started') {
    const p: WsEventPipelineStarted['payload'] = {
      idea: str(payload.idea) ?? '',
      node: str(payload.node) ?? '',
    }
    if (taskId !== undefined) p.task_id = taskId
    return { event: 'pipeline_started', seq, run_id, timestamp, payload: p }
  }

  // C3 (M-12): hitl_gate_reached — tipa os campos que o banner consome
  // (gate_node, timeout_seconds, on_timeout) sem exigir presença obrigatória.
  if (r.event === 'hitl_gate_reached') {
    const p: WsEventHitlGate['payload'] = { gate_node: str(payload.gate_node) ?? '' }
    const threadId = str(payload.thread_id)
    if (threadId !== undefined) p.thread_id = threadId
    const timeoutSeconds = num(payload.timeout_seconds)
    if (timeoutSeconds !== undefined) p.timeout_seconds = timeoutSeconds
    const onTimeout = str(payload.on_timeout)
    if (onTimeout !== undefined) p.on_timeout = onTimeout
    const ts = num(payload.ts)
    if (ts !== undefined) p.ts = ts
    if (taskId !== undefined) p.task_id = taskId
    return { event: 'hitl_gate_reached', seq, run_id, timestamp, payload: p }
  }

  // V1.1 (ADR-0007): token_delta — streaming incremental do LLM. Nó válido via
  // NODE_MAP (sem restrição EXECUTION_NODES: deltas podem vir de qualquer nó
  // que chama LLM), content obrigatório string. Inválido → envelope nulo.
  if (r.event === 'token_delta') {
    const rawNode = str(payload.node)
    const node = rawNode ? normalizeNodeName(rawNode) : null
    if (!node) return null
    const content = str(payload.content)
    if (content === undefined) return null
    const p: WsEventTokenDelta['payload'] = { node, content }
    if (taskId !== undefined) p.task_id = taskId
    return { event: 'token_delta', seq, run_id, timestamp, payload: p }
  }

  // Eventos genéricos: payload = dados do evento (status, idea, current_node,
  // action, gate_node, timeout_seconds, error, duration_seconds, task_id…).
  // `event` já foi validado contra KNOWN — cast para a union de genéricos.
  const genericPayload: Record<string, unknown> = { ...payload }
  if (taskId !== undefined) genericPayload.task_id = taskId
  return { event: r.event as WsEventGeneric['event'], seq, run_id, timestamp, payload: genericPayload }
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
