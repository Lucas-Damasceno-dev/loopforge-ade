import { afterEach, describe, it, expect, vi } from 'vitest'
import { normalizeWsEvent, createWsClient } from '../ws'

// jsdom não tem WebSocket real — FakeWebSocket global para os testes.
class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  sent: string[] = []
  closed = false
  constructor(public url: string) { FakeWebSocket.instances.push(this) }
  send(d: string) { this.sent.push(d) }
  close() { this.closed = true; this.onclose?.() }
  // helpers de teste:
  emit(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }) }
  open() { this.onopen?.() }
}
vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket)

describe('normalizeWsEvent', () => {
  it('normalizes v1 envelope (seq/run_id/timestamp/payload) to v1 shape', () => {
    const raw = {
      seq: 3,
      event: 'node_execution',
      run_id: 'uuid-1',
      timestamp: 1234,
      payload: { node: 'developer', status: 'completed', next_agent: 'qa', attempt_count: 2, task_id: 't-9' },
    }
    expect(normalizeWsEvent(raw)).toMatchObject({
      seq: 3,
      event: 'node_execution',
      run_id: 'uuid-1',
      timestamp: 1234,
      payload: { node: 'developer', status: 'completed', next_agent: 'qa', attempt_count: 2, task_id: 't-9' },
    })
  })
  it('keeps legacy flat dispatcher events working (task_id moved into payload)', () => {
    const raw = { event: 'node_execution', task_id: 't', timestamp: 1, node: 'developer', status: 'completed' }
    expect(normalizeWsEvent(raw)).toMatchObject({
      event: 'node_execution',
      timestamp: 1,
      payload: { node: 'developer', task_id: 't' },
    })
  })
  it('maps legacy alias dev to canonical developer', () => {
    const raw = { event: 'node_execution', task_id: 't', node: 'dev', status: 'completed' }
    expect(normalizeWsEvent(raw)).toMatchObject({ event: 'node_execution', payload: { node: 'developer' } })
  })
  it('rejects node_execution for virtual/sub-card nodes (entry/retry/appsec/devops)', () => {
    for (const name of ['entry', 'retry', 'appsec', 'devops']) {
      expect(normalizeWsEvent({ event: 'node_execution', node: name, status: 'completed' })).toBeNull()
    }
  })
  it('maps 1:1 remaining execution nodes (cpo/pm/tech_lead/test_writer/developer/qa/parallel_audit)', () => {
    for (const name of ['cpo', 'pm', 'tech_lead', 'test_writer', 'developer', 'qa', 'parallel_audit']) {
      expect(normalizeWsEvent({ event: 'node_execution', node: name, status: 'completed' })).toMatchObject({ payload: { node: name } })
    }
  })
  it('returns null for unknown node names', () => {
    expect(normalizeWsEvent({ event: 'node_execution', node: 'mystery_node', status: 'completed' })).toBeNull()
    expect(normalizeWsEvent({ event: 'node_execution', node: 42, status: 'completed' })).toBeNull()
    expect(normalizeWsEvent({ event: 'node_execution', status: 'completed' })).toBeNull()
  })
  it('returns null for unknown events', () => {
    expect(normalizeWsEvent({ event: 'mystery' })).toBeNull()
  })
  it('normalizes generic events: v1 run_updated payload and legacy flat run_created', () => {
    const v1 = normalizeWsEvent({ seq: 1, event: 'run_updated', run_id: 'r1', timestamp: 5, payload: { status: 'paused', current_node: 'qa' } })
    expect(v1).toMatchObject({ event: 'run_updated', run_id: 'r1', timestamp: 5, payload: { status: 'paused', current_node: 'qa' } })
    const legacy = normalizeWsEvent({ event: 'run_created', run_id: 'r2', idea: 'x', status: 'queued' })
    expect(legacy).toMatchObject({ event: 'run_created', run_id: 'r2', payload: { idea: 'x', status: 'queued' } })
  })
  it('normalizes run_paused with status payload', () => {
    expect(normalizeWsEvent({ event: 'run_paused', run_id: 'r1', payload: { status: 'paused' } })).toMatchObject({
      event: 'run_paused',
      run_id: 'r1',
      payload: { status: 'paused' },
    })
  })
  it('normalizes hitl_gate_reached with typed payload (C3)', () => {
    const raw = {
      seq: 7,
      event: 'hitl_gate_reached',
      run_id: 'r1',
      timestamp: 123,
      payload: { gate_node: 'qa', thread_id: 'run-r1', timeout_seconds: 300, on_timeout: 'continue', ts: 456 },
    }
    expect(normalizeWsEvent(raw)).toMatchObject({
      event: 'hitl_gate_reached',
      run_id: 'r1',
      timestamp: 123,
      payload: { gate_node: 'qa', thread_id: 'run-r1', timeout_seconds: 300, on_timeout: 'continue', ts: 456 },
    })
  })
  it('normalizes fork_created as generic event', () => {
    const raw = { event: 'fork_created', run_id: 'f1', payload: { parent_run_id: 'r1', fork_run_id: 'f1' } }
    expect(normalizeWsEvent(raw)).toMatchObject({
      event: 'fork_created',
      run_id: 'f1',
      payload: { parent_run_id: 'r1', fork_run_id: 'f1' },
    })
  })
  it('returns null for non-object input (null/string/number/array)', () => {
    expect(normalizeWsEvent(null)).toBeNull()
    expect(normalizeWsEvent(undefined)).toBeNull()
    expect(normalizeWsEvent('node_execution')).toBeNull()
    expect(normalizeWsEvent(42)).toBeNull()
    expect(normalizeWsEvent(['node_execution'])).toBeNull()
  })
  it('returns null when event is missing or not a string', () => {
    expect(normalizeWsEvent({})).toBeNull()
    expect(normalizeWsEvent({ event: 42 })).toBeNull()
    expect(normalizeWsEvent({ event: null })).toBeNull()
  })
  it('node_execution with payload as non-object falls back to flat snapshot', () => {
    // payload inválido (string) → snapshot dos campos top-level (compat legado).
    const raw = { event: 'node_execution', node: 'developer', status: 'completed', payload: 'oops' }
    expect(normalizeWsEvent(raw)).toMatchObject({ event: 'node_execution', payload: { node: 'developer' } })
    // Sem node no snapshot → envelope desconhecido.
    expect(normalizeWsEvent({ event: 'node_execution', payload: 'oops' })).toBeNull()
  })
  it('drops non-numeric seq/timestamp/attempt_count instead of coercing', () => {
    const raw = { seq: '3', event: 'node_execution', run_id: 'r1', timestamp: '1234', payload: { node: 'qa', attempt_count: '2' } }
    const ev = normalizeWsEvent(raw)
    expect(ev?.seq).toBeUndefined()
    expect(ev?.timestamp).toBeUndefined()
    expect(ev && 'attempt_count' in ev.payload ? ev.payload.attempt_count : undefined).toBeUndefined()
    expect(ev).toMatchObject({ event: 'node_execution', payload: { node: 'qa' } })
  })
  it('normalizes legacy flat hitl_gate_reached (no payload object)', () => {
    const raw = { event: 'hitl_gate_reached', run_id: 'r1', gate_node: 'qa', timeout_seconds: 60, on_timeout: 'pause' }
    expect(normalizeWsEvent(raw)).toMatchObject({
      event: 'hitl_gate_reached',
      payload: { gate_node: 'qa', timeout_seconds: 60, on_timeout: 'pause' },
    })
  })
  it('hitl_gate_reached tolerates missing optional fields', () => {
    expect(normalizeWsEvent({ event: 'hitl_gate_reached', payload: {} })).toMatchObject({
      event: 'hitl_gate_reached',
      payload: { gate_node: '' },
    })
  })
  it('normalizes token_delta v1 envelope (ADR-0007)', () => {
    const raw = {
      seq: 9,
      event: 'token_delta',
      run_id: 'r1',
      timestamp: 123,
      payload: { node: 'developer', content: 'Ola' },
    }
    expect(normalizeWsEvent(raw)).toMatchObject({
      seq: 9,
      event: 'token_delta',
      run_id: 'r1',
      timestamp: 123,
      payload: { node: 'developer', content: 'Ola' },
    })
  })
  it('token_delta maps legacy alias dev to developer and keeps task_id', () => {
    expect(
      normalizeWsEvent({ event: 'token_delta', run_id: 'r1', task_id: 't-1', node: 'dev', content: 'x' }),
    ).toMatchObject({
      event: 'token_delta',
      run_id: 'r1',
      payload: { node: 'developer', content: 'x', task_id: 't-1' },
    })
  })
  it('token_delta rejects unknown node / non-string or missing content', () => {
    expect(normalizeWsEvent({ event: 'token_delta', payload: { node: 'mystery', content: 'x' } })).toBeNull()
    expect(normalizeWsEvent({ event: 'token_delta', payload: { node: 'developer', content: 42 } })).toBeNull()
    expect(normalizeWsEvent({ event: 'token_delta', payload: { node: 'developer' } })).toBeNull()
    expect(normalizeWsEvent({ event: 'token_delta', payload: { content: 'x' } })).toBeNull()
  })
})

describe('createWsClient', () => {
  afterEach(() => {
    vi.useRealTimers()
    FakeWebSocket.instances.length = 0
  })

  it('connects, receives event, reconnects with backoff after close', () => {
    vi.useFakeTimers()
    const onEvent = vi.fn()
    const client = createWsClient({ url: 'ws://x', onEvent, backoffMs: 1 })
    client.connect()
    const ws = FakeWebSocket.instances[0]
    ws.open()
    ws.emit({ event: 'run_created', run_id: 'r1', idea: 'x', status: 'pending' })
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ event: 'run_created' }))
    ws.close()
    // reconnect: nova instância criada após close (timers fake)
    vi.advanceTimersByTime(2)
    expect(FakeWebSocket.instances.length).toBe(2)
    client.disconnect()
    vi.advanceTimersByTime(30_000)
    expect(FakeWebSocket.instances.length).toBe(2)
  })

  it('does not reconnect after intentional disconnect', () => {
    vi.useFakeTimers()
    const client = createWsClient({ url: 'ws://x', onEvent: () => {}, backoffMs: 1 })
    client.connect()
    const ws = FakeWebSocket.instances[0]
    ws.open()
    client.disconnect()
    expect(FakeWebSocket.instances.length).toBe(1)
    vi.advanceTimersByTime(30_000)
    expect(FakeWebSocket.instances.length).toBe(1)
  })

  it('sends pong on ping', () => {
    const client = createWsClient({ url: 'ws://x', onEvent: () => {} })
    client.connect()
    const ws = FakeWebSocket.instances[0]
    ws.open()
    ws.emit({ type: 'ping' })
    expect(ws.sent).toContain('{"type":"pong"}')
  })

  it('sends token in query string when provided', () => {
    const client = createWsClient({ url: 'ws://x', token: 'secret', onEvent: () => {} })
    client.connect()
    expect(FakeWebSocket.instances[0].url).toBe('ws://x?token=secret')
  })

  it('appends token with & when the url already has a query string', () => {
    const client = createWsClient({ url: 'ws://x?run_id=1', token: 't', onEvent: () => {} })
    client.connect()
    expect(FakeWebSocket.instances[0].url).toBe('ws://x?run_id=1&token=t')
  })

  it('reports status transitions connecting→open and connecting→closed', () => {
    const statuses: string[] = []
    const client = createWsClient({ url: 'ws://x', onEvent: () => {}, onStatus: (s) => statuses.push(s) })
    client.connect()
    expect(statuses).toEqual(['connecting'])
    FakeWebSocket.instances[0].open()
    expect(statuses).toEqual(['connecting', 'open'])
    FakeWebSocket.instances[0].close()
    // Fechou sem disconnect intencional → agendou reconnect (nova 'connecting').
    expect(statuses[statuses.length - 1]).toBe('closed')
  })

  it('reports error status via onerror', () => {
    const statuses: string[] = []
    const client = createWsClient({ url: 'ws://x', onEvent: () => {}, onStatus: (s) => statuses.push(s) })
    client.connect()
    FakeWebSocket.instances[0].onerror?.()
    expect(statuses).toContain('error')
    client.disconnect()
  })

  it('caps reconnect backoff at 10s', () => {
    vi.useFakeTimers()
    const client = createWsClient({ url: 'ws://x', onEvent: () => {}, backoffMs: 8000 })
    client.connect()
    // Sockets NUNCA abrem → attempt cresce a cada close (backoff exponencial).
    // 1º close: delay = min(8000 * 2^0, 10000) = 8000.
    FakeWebSocket.instances[0].close()
    vi.advanceTimersByTime(7999)
    expect(FakeWebSocket.instances.length).toBe(1)
    vi.advanceTimersByTime(1)
    expect(FakeWebSocket.instances.length).toBe(2)
    // 2º close: delay = min(8000 * 2^1, 10000) = 10000 (capado).
    FakeWebSocket.instances[1].close()
    vi.advanceTimersByTime(9999)
    expect(FakeWebSocket.instances.length).toBe(2)
    vi.advanceTimersByTime(1)
    expect(FakeWebSocket.instances.length).toBe(3)
    client.disconnect()
    vi.useRealTimers()
  })

  it('ignores non-JSON frames without throwing', () => {
    const onEvent = vi.fn()
    const client = createWsClient({ url: 'ws://x', onEvent })
    client.connect()
    const ws = FakeWebSocket.instances[0]
    ws.open()
    ws.emit('not json at all')
    ws.emit(null)
    expect(onEvent).not.toHaveBeenCalled()
    client.disconnect()
  })

  it('disconnect before any open schedules no reconnect', () => {
    vi.useFakeTimers()
    const client = createWsClient({ url: 'ws://x', onEvent: () => {}, backoffMs: 1 })
    client.connect()
    client.disconnect()
    FakeWebSocket.instances[0].close()
    vi.advanceTimersByTime(30_000)
    expect(FakeWebSocket.instances.length).toBe(1)
    vi.useRealTimers()
  })
})
