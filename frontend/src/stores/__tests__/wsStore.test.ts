import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { useWsStore, __resetWsStoreForTest } from '../wsStore'
import { useRunsStore } from '../runsStore'
import { registerWsHandler } from '../wsBridge'

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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// Run ativa no store — pré-requisito do backfill (só runs do store são paginadas).
function setActiveRun(id: string) {
  useRunsStore.setState({ runs: [{ id, idea: 'x', stack: 'python', status: 'running' }], activeRunId: id, queue: [], past: [], future: [] })
}

describe('wsStore', () => {
  beforeEach(() => {
    FakeWebSocket.instances.length = 0
    useRunsStore.setState({ runs: [], activeRunId: null, queue: [], past: [], future: [] })
    // Reset completo: hadOpen (flag module-level) + lastSeqByRun — senão o
    // 1º open de cada teste faria backfill espúrio (estado persiste entre testes).
    __resetWsStoreForTest()
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

  it('primeiro open NÃO dispara backfill (sem runs de onde buscar)', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    setActiveRun('r1')
    useWsStore.getState().connect()
    const ws = FakeWebSocket.instances[0]
    ws.open()
    // Espera microtasks (backfill é assíncrono) e confirma que nada foi buscado.
    await new Promise((r) => setTimeout(r, 0))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reconnect faz backfill a partir do último seq visto (após live seq 5)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      run_id: 'r1',
      events: [{ seq: 9, event: 'pipeline_started', run_id: 'r1', payload: { idea: 'x', node: 'cpo' } }],
      next_after_seq: 9,
    }))
    vi.stubGlobal('fetch', fetchMock)
    setActiveRun('r1')

    const spy = vi.fn()
    const unsub = registerWsHandler(spy)

    // 1ª conexão: open + evento live seq 5 (sem backfill — hadOpen false).
    useWsStore.getState().connect()
    const ws1 = FakeWebSocket.instances[0]
    ws1.open()
    ws1.emit({ seq: 5, event: 'run_updated', run_id: 'r1', payload: { status: 'running' } })
    expect(useWsStore.getState().lastSeqByRun.r1).toBe(5)

    // 2ª conexão (reconnect): open → backfill busca after_seq=5.
    useWsStore.getState().connect()
    const ws2 = FakeWebSocket.instances[1]
    ws2.open()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/v1/runs/r1/events?after_seq=5&limit=200')
    // Evento do backfill despachado no barramento.
    await vi.waitFor(() => expect(spy).toHaveBeenCalledWith(expect.objectContaining({ seq: 9, event: 'pipeline_started', run_id: 'r1' })))
    expect(useWsStore.getState().lastSeqByRun.r1).toBe(9)
    unsub()
  })

  it('backfill não re-despacha evento já visto (dedupe no momento do dispatch)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      run_id: 'r1',
      events: [
        { seq: 5, event: 'pipeline_started', run_id: 'r1', payload: { idea: 'x', node: 'cpo' } }, // já visto via live
        { seq: 6, event: 'pipeline_started', run_id: 'r1', payload: { idea: 'x', node: 'cpo' } }, // novo
      ],
      next_after_seq: 6,
    }))
    vi.stubGlobal('fetch', fetchMock)
    setActiveRun('r1')

    const spy = vi.fn()
    const unsub = registerWsHandler(spy)

    useWsStore.getState().connect()
    const ws1 = FakeWebSocket.instances[0]
    ws1.open()
    ws1.emit({ seq: 5, event: 'pipeline_started', run_id: 'r1', payload: { idea: 'x', node: 'cpo' } })
    spy.mockClear()

    useWsStore.getState().connect()
    const ws2 = FakeWebSocket.instances[1]
    ws2.open()
    await vi.waitFor(() => expect(spy).toHaveBeenCalledWith(expect.objectContaining({ seq: 6 })))
    // seq 5 não foi re-despachado pelo backfill — só o seq 6 novo.
    expect(spy).toHaveBeenCalledTimes(1)
    unsub()
  })

  it('backfill pagina enquanto a resposta vier cheia (next_after_seq)', async () => {
    const fullPage = Array.from({ length: 200 }, (_, i) => ({
      seq: i + 1, event: 'pipeline_started', run_id: 'r1', payload: { idea: 'x', node: 'cpo' },
    }))
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ run_id: 'r1', events: fullPage, next_after_seq: 200 }))
      .mockResolvedValueOnce(jsonResponse({
        run_id: 'r1',
        events: [{ seq: 201, event: 'pipeline_started', run_id: 'r1', payload: { idea: 'x', node: 'cpo' } }],
        next_after_seq: 201,
      }))
    vi.stubGlobal('fetch', fetchMock)
    setActiveRun('r1')

    useWsStore.getState().connect()
    const ws1 = FakeWebSocket.instances[0]
    ws1.open() // hadOpen → true; sem backfill no primeiro open

    useWsStore.getState().connect()
    const ws2 = FakeWebSocket.instances[1]
    ws2.open()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(String(fetchMock.mock.calls[0][0])).toContain('after_seq=0&limit=200')
    expect(String(fetchMock.mock.calls[1][0])).toContain('after_seq=200&limit=200')
    expect(useWsStore.getState().lastSeqByRun.r1).toBe(201)
  })
})
