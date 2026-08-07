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
  it('passes through known dispatcher events', () => {
    const raw = { event: 'node_execution', task_id: 't', timestamp: 1, node: 'dev', status: 'completed' }
    expect(normalizeWsEvent(raw)).toMatchObject({ event: 'node_execution', payload: { node: 'dev' } })
  })
  it('returns null for unknown events', () => {
    expect(normalizeWsEvent({ event: 'mystery' })).toBeNull()
  })
  it('maps real graph node developer to dev', () => {
    const raw = { event: 'node_execution', task_id: 't', node: 'developer', status: 'completed' }
    expect(normalizeWsEvent(raw)).toMatchObject({ event: 'node_execution', payload: { node: 'dev' } })
  })
  it('collapses appsec and devops into parallel_audit', () => {
    expect(normalizeWsEvent({ event: 'node_execution', node: 'appsec', status: 'completed' })).toMatchObject({ payload: { node: 'parallel_audit' } })
    expect(normalizeWsEvent({ event: 'node_execution', node: 'devops', status: 'completed' })).toMatchObject({ payload: { node: 'parallel_audit' } })
  })
  it('maps 1:1 remaining graph nodes (cpo/pm/tech_lead/test_writer/qa)', () => {
    for (const name of ['cpo', 'pm', 'tech_lead', 'test_writer', 'qa']) {
      expect(normalizeWsEvent({ event: 'node_execution', node: name, status: 'completed' })).toMatchObject({ payload: { node: name } })
    }
  })
  it('returns null for unknown node names', () => {
    expect(normalizeWsEvent({ event: 'node_execution', node: 'mystery_node', status: 'completed' })).toBeNull()
    expect(normalizeWsEvent({ event: 'node_execution', node: 42, status: 'completed' })).toBeNull()
    expect(normalizeWsEvent({ event: 'node_execution', status: 'completed' })).toBeNull()
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
})
