import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { createRun, listRuns, getRunCost, overrideRunBudget, apiFetch, ApiError, getApiKey, setApiKey, onUnauthorized, retryUnauthorizedRequests, rejectPendingUnauthorized, forkTrajectory, exportTrajectory, importTrajectory, getRunTimeline, threadIdForRun, callMcpTool } from '../api'

describe('api client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    localStorage.clear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('listRuns hits the v1 base URL', async () => {
    const body = { items: [{ id: 'r1', idea: 'x', status: 'pending' }], total: 1 }
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))
    const res = await listRuns()
    expect(res.items).toHaveLength(1)
    expect(res.total).toBe(1)
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/runs'), expect.anything())
  })

  it('createRun POSTs idea + stack + routing_mode (defaults mock_llm/interactive false)', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ id: 'r2', idea: 'hi', status: 'pending' }), { status: 200 }))
    const run = await createRun({ idea: 'hi', stack: 'go', routing_mode: 'fast' })
    expect(run.id).toBe('r2')
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ idea: 'hi', stack: 'go', routing_mode: 'fast', mock_llm: false, interactive: false })
  })

  it('getRunCost and overrideRunBudget use /runs/{id}/cost endpoints', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ run_id: 'r1', spent_usd: 2, estimated: false, budget: { max_usd: 10, percent_used: 0.2 }, budget_warning: false }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ run_id: 'r1', spent_usd: 2, estimated: false, budget: { max_usd: 20, percent_used: 0.1 }, budget_warning: false }), { status: 200 }))
    const cost = await getRunCost('r1')
    expect(cost.budget.max_usd).toBe(10)
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/runs/r1/cost'), expect.anything())

    await overrideRunBudget('r1', { max_usd: 20 })
    const [url, init] = vi.mocked(fetch).mock.calls[1]
    expect(String(url)).toContain('/api/v1/runs/r1/cost/override')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ max_usd: 20 })
  })

  it('sends X-API-Key header from localStorage (lf_api_key)', async () => {
    setApiKey('secret')
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 }))
    await listRuns()
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect((init?.headers as Record<string, string>)['X-API-Key']).toBe('secret')
    expect(getApiKey()).toBe('secret')
  })

  it('throws ApiError with detail on non-2xx', async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ detail: 'boom' }), { status: 422 }))
    await expect(apiFetch('/runs')).rejects.toThrow(ApiError)
    await expect(apiFetch('/runs')).rejects.toMatchObject({ status: 422, detail: 'boom' })
  })

  it('401 notifies listeners and retries the pending call after saving the key', async () => {
    const listener = vi.fn()
    const unsub = onUnauthorized(listener)
    try {
      // 1ª chamada: 401 (sem key) → pendura e notifica.
      vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 401 }))
      const pending = apiFetch<{ ok: boolean }>('/runs')
      await vi.waitFor(() => expect(listener).toHaveBeenCalled())

      // 2ª chamada (retry): com key salva → sucesso.
      setApiKey('secret')
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      retryUnauthorizedRequests()
      await expect(pending).resolves.toEqual({ ok: true })
      // O retry reenviou com a X-API-Key.
      const [, init] = vi.mocked(fetch).mock.calls[1]
      expect((init?.headers as Record<string, string>)['X-API-Key']).toBe('secret')
    } finally {
      unsub()
    }
  })

  it('rejectPendingUnauthorized settles pending calls with ApiError', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 401 }))
    const pending = apiFetch('/runs')
    await vi.waitFor(() => expect(onUnauthorized).toBeDefined())
    rejectPendingUnauthorized()
    await expect(pending).rejects.toMatchObject({ status: 401 })
  })

  it('trajectory endpoints (Fase C): fork/export/import/timeline hit v1 routes', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ fork_run_id: 'f1', thread_id: 'run-f1', checkpoint_id: 'c1' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ schema_version: '1.1', run_id: 'r1', thread_id: 'run-r1', checkpoints: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ run_id: 'r9', thread_id: 'run-r9', checkpoints_imported: 3 }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ run_id: 'r1', timeline: [], total_count: 0, has_more: false, next_after_seq: null }), { status: 200 }))

    // Fork: thread canônica 'run-{id}' → POST /trajectories/{thread_id}/fork.
    const fork = await forkTrajectory(threadIdForRun('r1'))
    expect(fork.fork_run_id).toBe('f1')
    expect(threadIdForRun('r1')).toBe('run-r1')
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/trajectories/run-r1/fork'), expect.objectContaining({ method: 'POST' }))

    // Export: POST /trajectories/export/{run_id} (schema 1.1).
    const exp = await exportTrajectory('r1')
    expect(exp.schema_version).toBe('1.1')
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/trajectories/export/r1'), expect.objectContaining({ method: 'POST' }))

    // Import: POST /trajectories/import com o payload exportado.
    const imp = await importTrajectory({ schema_version: '1.1', run_id: 'r9', thread_id: 'run-r9', checkpoints: [] })
    expect(imp.checkpoints_imported).toBe(3)
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/trajectories/import'), expect.objectContaining({ method: 'POST' }))

    // Timeline: GET /runs/{run_id}/timeline?after_seq=&limit=.
    const tl = await getRunTimeline('r1', 10, 50)
    expect(tl.has_more).toBe(false)
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/runs/r1/timeline?after_seq=10&limit=50'), expect.anything())
  })

  it('fork throws ApiError with PT detail on 404', async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ detail: 'Run run-r1 não encontrada (sem trajetória)' }), { status: 404 }))
    await expect(forkTrajectory('run-r1')).rejects.toMatchObject({ status: 404, detail: 'Run run-r1 não encontrada (sem trajetória)' })
  })

  it('callMcpTool POSTs {arguments} to /mcp/servers/{name}/tools/{tool} (Fase D)', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ content: 'ok' }), { status: 200 }))
    const res = await callMcpTool('fs', 'read', { path: '/tmp/x' })
    expect(res).toEqual({ content: 'ok' })
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain('/api/v1/mcp/servers/fs/tools/read')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ arguments: { path: '/tmp/x' } })
  })

  it('callMcpTool defaults arguments to {}', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))
    await callMcpTool('fs', 'read')
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(JSON.parse(String(init?.body))).toEqual({ arguments: {} })
  })

  it('callMcpTool throws ApiError with backend detail on 403', async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ detail: 'Tool read não permitida (allowlist do ade.yaml)' }), { status: 403 }))
    await expect(callMcpTool('fs', 'read', {})).rejects.toMatchObject({ status: 403, detail: 'Tool read não permitida (allowlist do ade.yaml)' })
  })
})
