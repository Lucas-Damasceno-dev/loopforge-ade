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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// Run ativa no store — pré-requisito do backfill (só runs do store são paginadas).
function setActiveRun(id: string) {
  useRunsStore.setState({ runs: [{ id, idea: 'x', stack: 'python', status: 'running' }], activeRunId: id, queue: [], past: [], future: [] })
}

// Fetch com resolução controlada (deferred): permite emitir evento live DURANTE
// o fetch do backfill, simulando a corrida real dedupe-vs-missed.
function deferredFetch() {
  let resolve!: (r: Response) => void
  const promise = new Promise<Response>((res) => { resolve = res })
  const fn = vi.fn(() => promise)
  return { fn, resolve }
}

function pipelineEvent(seq: number) {
  return { seq, event: 'pipeline_started', run_id: 'r1', payload: { idea: 'x', node: 'cpo' } }
}

describe('wsStore', () => {
  beforeEach(() => {
    FakeWebSocket.instances.length = 0
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket)
    vi.stubGlobal('fetch', vi.fn())
    useRunsStore.setState({ runs: [], activeRunId: null, queue: [], past: [], future: [] })
    // Reset completo: lastSeqByRun + watermark + client (module-level) — senão o
    // 1º open de cada teste faria backfill com estado residual (estado persiste).
    __resetWsStoreForTest()
  })
  afterEach(() => {
    useWsStore.getState().disconnect()
    vi.unstubAllGlobals()
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

  it('primeiro open dispara backfill das runs ativas (B5 — reload recupera o gap)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      run_id: 'r1',
      events: [pipelineEvent(9)],
      next_after_seq: 9,
    }))
    vi.stubGlobal('fetch', fetchMock)
    setActiveRun('r1')

    const spy = vi.fn()
    const unsub = registerWsHandler(spy)

    useWsStore.getState().connect()
    const ws = FakeWebSocket.instances[0]
    ws.open()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/v1/runs/r1/events?after_seq=0&limit=200')
    // Evento do backfill despachado normalizado no barramento.
    await vi.waitFor(() => expect(spy).toHaveBeenCalledWith(expect.objectContaining({ seq: 9, event: 'pipeline_started', run_id: 'r1' })))
    expect(useWsStore.getState().lastSeqByRun.r1).toBe(9)
    unsub()
  })

  it('primeiro open sem runs ativas não busca nada', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    useWsStore.getState().connect()
    const ws = FakeWebSocket.instances[0]
    ws.open()
    // Espera microtasks (backfill é assíncrono) e confirma que nada foi buscado.
    await new Promise((r) => setTimeout(r, 0))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('backfill normaliza ANTES de despachar (B6): evento não-normalizável é pulado', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      run_id: 'r1',
      events: [
        pipelineEvent(3),
        // 'run_paused' saiu do KNOWN → normalize retorna null → nunca despacha.
        { seq: 4, event: 'run_paused', run_id: 'r1', payload: { status: 'paused' } },
      ],
      next_after_seq: 4,
    }))
    vi.stubGlobal('fetch', fetchMock)
    setActiveRun('r1')

    const spy = vi.fn()
    const unsub = registerWsHandler(spy)

    useWsStore.getState().connect()
    const ws = FakeWebSocket.instances[0]
    ws.open()
    await vi.waitFor(() => expect(spy).toHaveBeenCalledWith(expect.objectContaining({ seq: 3 })))
    expect(spy).not.toHaveBeenCalledWith(expect.objectContaining({ seq: 4 }))
    // lastSeq avança até o último evento NORMALIZADO (3), não o 4 rejeitado.
    expect(useWsStore.getState().lastSeqByRun.r1).toBe(3)
    unsub()
  })

  it('reconnect faz backfill a partir do último seq conhecido (após 1º open + live)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      run_id: 'r1',
      events: [pipelineEvent(9)],
      next_after_seq: 9,
    }))
    vi.stubGlobal('fetch', fetchMock)
    setActiveRun('r1')

    const spy = vi.fn()
    const unsub = registerWsHandler(spy)

    // 1ª conexão: primeiro open JÁ faz catch-up (B5) — busca from 0.
    useWsStore.getState().connect()
    const ws1 = FakeWebSocket.instances[0]
    ws1.open()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/v1/runs/r1/events?after_seq=0&limit=200')
    await vi.waitFor(() => expect(spy).toHaveBeenCalledWith(expect.objectContaining({ seq: 9 })))
    expect(useWsStore.getState().lastSeqByRun.r1).toBe(9)

    // Evento live com seq ANTERIOR (5, já coberto pelo backfill) não regride o mapa.
    ws1.emit({ seq: 5, event: 'run_updated', run_id: 'r1', payload: { status: 'running' } })
    expect(useWsStore.getState().lastSeqByRun.r1).toBe(9)

    // 2ª conexão (reconnect): backfill busca a partir do último seq conhecido (9).
    fetchMock.mockClear()
    useWsStore.getState().connect()
    const ws2 = FakeWebSocket.instances[1]
    ws2.open()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/v1/runs/r1/events?after_seq=9&limit=200')
    unsub()
  })

  it('dedupe real: live durante o fetch → misses despachados, seq sobreposto NÃO re-despachado', async () => {
    const { fn: fetchMock, resolve } = deferredFetch()
    vi.stubGlobal('fetch', fetchMock)
    setActiveRun('r1')

    const spy = vi.fn()
    const unsub = registerWsHandler(spy)

    useWsStore.getState().connect()
    const ws1 = FakeWebSocket.instances[0]
    ws1.open() // 1º open também dispara backfill (B5) — fetch fica pendente (deferred)

    useWsStore.getState().connect()
    const ws2 = FakeWebSocket.instances[1]
    ws2.open() // reconnect → backfill dispara de novo, fetch continua PENDENTE (deferred)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())

    // Evento live chega DURANTE o fetch: watermark vira 10 (e mapa vai a 10).
    ws2.emit(pipelineEvent(10))
    spy.mockClear()

    // Backfill responde com misses antigos (8, 9) + o sobreposto (10).
    resolve(jsonResponse({ run_id: 'r1', events: [pipelineEvent(8), pipelineEvent(9), pipelineEvent(10)], next_after_seq: 10 }))

    await vi.waitFor(() => expect(spy).toHaveBeenCalledWith(expect.objectContaining({ seq: 8 })))
    // Misses despachados.
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ seq: 9 }))
    // Sobreposto NÃO re-despachado (>= watermark 10).
    expect(spy).not.toHaveBeenCalledWith(expect.objectContaining({ seq: 10 }))
    // Mapa avança só até o watermark (10) — não regride.
    expect(useWsStore.getState().lastSeqByRun.r1).toBe(10)
    unsub()
  })

  it('missed recovery: mapa avançado por live (seq alto) NÃO bloqueia misses antigos', async () => {
    const { fn: fetchMock, resolve } = deferredFetch()
    vi.stubGlobal('fetch', fetchMock)
    setActiveRun('r1')

    const spy = vi.fn()
    const unsub = registerWsHandler(spy)

    useWsStore.getState().connect()
    const ws1 = FakeWebSocket.instances[0]
    ws1.open() // 1º open também dispara backfill (B5) — fetch pendente

    useWsStore.getState().connect()
    const ws2 = FakeWebSocket.instances[1]
    ws2.open()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())

    // Live com seq ALTO (100) durante o fetch → mapa pula p/ 100.
    ws2.emit(pipelineEvent(100))

    // Página do backfill traz só misses antigos (2, 3) — todos < watermark 100.
    resolve(jsonResponse({ run_id: 'r1', events: [pipelineEvent(2), pipelineEvent(3)], next_after_seq: 3 }))

    await vi.waitFor(() => expect(spy).toHaveBeenCalledWith(expect.objectContaining({ seq: 2 })))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ seq: 3 }))
    // Mapa permanece no high-water mark (100).
    expect(useWsStore.getState().lastSeqByRun.r1).toBe(100)
    unsub()
  })

  it('watermark é por run: live da run A não false-skip os misses da run B (cross-run)', async () => {
    // Duas runs ativas — cada backfill tem seu próprio fetch (deferred por chamada).
    useRunsStore.setState({
      runs: [
        { id: 'rA', idea: 'x', stack: 'python', status: 'running' },
        { id: 'rB', idea: 'y', stack: 'python', status: 'running' },
      ],
      activeRunId: 'rA',
      queue: [],
      past: [],
      future: [],
    })
    const deferreds: Array<(r: Response) => void> = []
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>((res) => { deferreds.push(res) }))
    vi.stubGlobal('fetch', fetchMock)

    const spy = vi.fn()
    const unsub = registerWsHandler(spy)

    useWsStore.getState().connect()
    const ws1 = FakeWebSocket.instances[0]
    ws1.open() // 1º open → backfill rA + rB (dois fetches pendentes)

    useWsStore.getState().connect()
    const ws2 = FakeWebSocket.instances[1]
    ws2.open() // reconnect → backfill rA + rB de novo (mais dois fetches pendentes)
    // B5: 1º open JÁ dispara backfill — as duas primeiras chamadas são do ws1.
    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2))
    expect(String(fetchMock.mock.calls[0][0])).toContain('/runs/rA/events')
    expect(String(fetchMock.mock.calls[1][0])).toContain('/runs/rB/events')

    // Evento live da run A (seq 10) durante o fetch → watermark só da rA.
    ws2.emit({ seq: 10, event: 'pipeline_started', run_id: 'rA', payload: { idea: 'x', node: 'cpo' } })
    spy.mockClear()

    // Backfill da rA responde com miss 8 (< 10 → despacha) + sobreposto 10 (pula).
    deferreds[0](jsonResponse({ run_id: 'rA', events: [
      { seq: 8, event: 'pipeline_started', run_id: 'rA', payload: { idea: 'x', node: 'cpo' } },
      { seq: 10, event: 'pipeline_started', run_id: 'rA', payload: { idea: 'x', node: 'cpo' } },
    ], next_after_seq: 10 }))
    // Backfill da rB responde com seqs 601, 602 — NADA a ver com o watermark da rA.
    deferreds[1](jsonResponse({ run_id: 'rB', events: [
      { seq: 601, event: 'pipeline_started', run_id: 'rB', payload: { idea: 'y', node: 'qa' } },
      { seq: 602, event: 'pipeline_started', run_id: 'rB', payload: { idea: 'y', node: 'qa' } },
    ], next_after_seq: 602 }))

    // rA: miss 8 despachado, sobreposto 10 NÃO re-despachado.
    await vi.waitFor(() => expect(spy).toHaveBeenCalledWith(expect.objectContaining({ seq: 8, run_id: 'rA' })))
    expect(spy).not.toHaveBeenCalledWith(expect.objectContaining({ seq: 10, run_id: 'rA' }))
    // rB: misses 601/602 despachados (guard global antigo os false-skipparia).
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ seq: 601, run_id: 'rB' }))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ seq: 602, run_id: 'rB' }))
    unsub()
  })

  it('backfill pagina enquanto a resposta vier cheia (next_after_seq)', async () => {
    const fullPage = Array.from({ length: 200 }, (_, i) => pipelineEvent(i + 1))
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ run_id: 'r1', events: fullPage, next_after_seq: 200 }))
      .mockResolvedValueOnce(jsonResponse({ run_id: 'r1', events: [pipelineEvent(201)], next_after_seq: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    setActiveRun('r1')

    useWsStore.getState().connect()
    const ws1 = FakeWebSocket.instances[0]
    ws1.open() // 1º open já pagina: call 1 (after_seq=0) + call 2 (after_seq=200)
    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2))
    expect(String(fetchMock.mock.calls[0][0])).toContain('after_seq=0&limit=200')
    expect(String(fetchMock.mock.calls[1][0])).toContain('after_seq=200&limit=200')
    expect(useWsStore.getState().lastSeqByRun.r1).toBe(201)

    // Reconnect: base passa a ser o último seq (201) — mock esgotado → fetch
    // retorna undefined → apiFetch lança → catch silencioso do backfill.
    useWsStore.getState().connect()
    const ws2 = FakeWebSocket.instances[1]
    ws2.open()
    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3))
    expect(String(fetchMock.mock.calls[2][0])).toContain('after_seq=201&limit=200')
    expect(useWsStore.getState().lastSeqByRun.r1).toBe(201)
  })
})
