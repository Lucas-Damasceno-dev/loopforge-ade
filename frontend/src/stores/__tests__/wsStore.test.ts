import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { useWsStore } from '../wsStore'

// FakeWebSocket local — o wsStore usa o WebSocket global via createWsClient.
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
  emit(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }) }
  open() { this.onopen?.() }
}
vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket)

describe('wsStore', () => {
  beforeEach(() => {
    FakeWebSocket.instances.length = 0
    useWsStore.setState({ connected: false, lastEventAt: null })
  })
  afterEach(() => {
    useWsStore.getState().disconnect()
  })

  it('connect derives default ws url from location and opens', () => {
    useWsStore.getState().connect()
    const ws = FakeWebSocket.instances[0]
    expect(ws).toBeDefined()
    expect(ws.url).toContain('/ws/streaming')
    ws.open()
    expect(useWsStore.getState().connected).toBe(true)
  })

  it('onEvent updates lastEventAt and setConnected works', () => {
    useWsStore.getState().connect()
    const ws = FakeWebSocket.instances[0]
    ws.open()
    // Envelope v1 real (EventBus): seq/run_id/timestamp/payload.
    ws.emit({ seq: 1, event: 'run_created', run_id: 'r1', timestamp: 123, payload: { idea: 'x', status: 'pending' } })
    expect(useWsStore.getState().lastEventAt).toBeTypeOf('number')
    useWsStore.getState().setConnected(false)
    expect(useWsStore.getState().connected).toBe(false)
  })

  it('disconnect closes client and resets connected', () => {
    useWsStore.getState().connect()
    const ws = FakeWebSocket.instances[0]
    ws.open()
    expect(useWsStore.getState().connected).toBe(true)
    useWsStore.getState().disconnect()
    expect(useWsStore.getState().connected).toBe(false)
    expect(ws.closed).toBe(true)
  })
})
