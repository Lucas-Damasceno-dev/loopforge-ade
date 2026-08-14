import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { createRun, listRuns, getRunCost, getRunArtifacts, getRunQueue, overrideRunBudget, apiFetch, ApiError, getApiKey, setApiKey, onUnauthorized, retryUnauthorizedRequests, rejectPendingUnauthorized, forkTrajectory, exportTrajectory, importTrajectory, getRunTimeline, threadIdForRun, callMcpTool, listLessons, createLesson, deleteLesson, getGitInfo, getHealth, getRunEvents, listAgents, getAgent, createAgent, updateAgent, deleteAgent } from '../api'
import type { ArtifactsResponse } from '../types'

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

  it('getRunEvents GETs /runs/{id}/events with after_seq and returns normalized events', async () => {
    const body = { run_id: 'r1', events: [{ seq: 5, event: 'pipeline_started', run_id: 'r1', payload: {} }], next_after_seq: 5 }
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))
    const res = await getRunEvents('r1', 3, 200)
    expect(res.run_id).toBe('r1')
    expect(res.events).toHaveLength(1)
    expect(res.events[0].seq).toBe(5)
    expect(res.next_after_seq).toBe(5)
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/runs/r1/events?after_seq=3&limit=200'), expect.anything())
  })

  it('getRunQueue GETs /runs/queue and parses the E3 queue shape', async () => {
    const body = {
      max_concurrent: 2,
      active_count: 1,
      active: ['r1'],
      queued: [{ id: 'r2', idea: 'x', stack: 'python', status: 'queued', created_at: '2026-01-01T00:00:00' }],
    }
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))
    const res = await getRunQueue()
    expect(res.max_concurrent).toBe(2)
    expect(res.active_count).toBe(1)
    expect(res.queued).toHaveLength(1)
    expect(res.queued[0].id).toBe('r2')
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/runs/queue'), expect.anything())
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

  it('callMcpTool URL-encodes server/tool names', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))
    await callMcpTool('my server/1', 'read file', {})
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain('/api/v1/mcp/servers/my%20server%2F1/tools/read%20file')
    expect(String(url)).not.toContain('my server/1')
  })

  it('non-JSON error body yields ApiError with detail null', async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response('<html>gateway error</html>', { status: 502 }))
    await expect(apiFetch('/runs')).rejects.toMatchObject({ status: 502, detail: null })
  })

  it('setApiKey swallows localStorage failures (privacy/disabled storage)', () => {
    const getItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    expect(() => setApiKey('secret')).not.toThrow()
    getItem.mockRestore()
  })

  it('retries ALL pending 401 calls after saving the key', async () => {
    const listener = vi.fn()
    const unsub = onUnauthorized(listener)
    try {
      vi.mocked(fetch)
        .mockResolvedValueOnce(new Response('', { status: 401 }))
        .mockResolvedValueOnce(new Response('', { status: 401 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ a: 1 }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ b: 2 }), { status: 200 }))
      const p1 = apiFetch<{ a: number }>('/runs/1')
      const p2 = apiFetch<{ b: number }>('/runs/2')
      await vi.waitFor(() => expect(listener).toHaveBeenCalled())
      setApiKey('secret')
      retryUnauthorizedRequests()
      await expect(p1).resolves.toEqual({ a: 1 })
      await expect(p2).resolves.toEqual({ b: 2 })
      expect(fetch).toHaveBeenCalledTimes(4)
    } finally {
      unsub()
    }
  })

  it('sets Content-Type only when a body is present', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 }))
    await listRuns()
    const [, init] = vi.mocked(fetch).mock.calls[0]
    const headers = (init?.headers ?? {}) as Record<string, string>
    expect(headers['Content-Type']).toBeUndefined()

    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    await apiFetch('/runs', { method: 'POST', body: '{}' })
    const [, init2] = vi.mocked(fetch).mock.calls[1]
    expect((init2?.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('listLessons GETs /memory/lessons with no params by default', async () => {
    const body = [{ id: 1, run_id: 'r1', stack: 'python', idea: 'x', lesson_text: 'y', created_at: 1700000000 }]
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))
    const res = await listLessons()
    expect(res).toHaveLength(1)
    expect(res[0].id).toBe(1)
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/memory/lessons'), expect.anything())
  })

  it('listLessons serializes stack/query/limit query params', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }))
    await listLessons({ stack: 'python', query: 'pydantic v2', limit: 10 })
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/memory/lessons?stack=python&query=pydantic+v2&limit=10'),
      expect.anything(),
    )
  })

  it('createLesson POSTs the lesson payload to /memory/lessons', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: 1, run_id: 'r1', stack: 'python', idea: 'x', lesson_text: 'y', created_at: 1 }), { status: 201 }),
    )
    const lesson = await createLesson({ run_id: 'r1', stack: 'python', idea: 'x', lesson_text: 'y' })
    expect(lesson.id).toBe(1)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain('/api/v1/memory/lessons')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ run_id: 'r1', stack: 'python', idea: 'x', lesson_text: 'y' })
  })

  it('deleteLesson DELETEs /memory/lessons/{id} and resolves the confirmation', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ deleted: true }), { status: 200 }))
    const res = await deleteLesson(3)
    expect(res).toEqual({ deleted: true })
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain('/api/v1/memory/lessons/3')
    expect(init?.method).toBe('DELETE')
  })

  it('deleteLesson throws ApiError with PT detail on 404', async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ detail: 'Lição não encontrada.' }), { status: 404 }))
    await expect(deleteLesson(99)).rejects.toMatchObject({ status: 404, detail: 'Lição não encontrada.' })
  })

  it('getGitInfo GETs /git/{runId} and parses branch/head/status/log', async () => {
    const body = {
      branch: 'main',
      head: 'abc1234',
      status: [{ path: 'src/app.py', status: 'M' }],
      log: [{ hash: 'abc1234', subject: 'feat: app', author: 'Bot', when: '2026-08-12T10:00:00+00:00' }],
    }
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))
    const res = await getGitInfo('run-1')
    expect(res.branch).toBe('main')
    expect(res.status[0]).toEqual({ path: 'src/app.py', status: 'M' })
    expect(res.log[0].subject).toBe('feat: app')
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/git/run-1'), expect.anything())
  })

  it('getGitInfo URL-encodes the runId', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ branch: null, head: null, status: [], log: [] }), { status: 200 }))
    await getGitInfo('run abc/1')
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain('/api/v1/git/run%20abc%2F1')
  })

  it('getGitInfo throws ApiError with backend detail on 404', async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ detail: 'Diretório da run run-9 não é um repositório git' }), { status: 404 }))
    await expect(getGitInfo('run-9')).rejects.toMatchObject({ status: 404, detail: 'Diretório da run run-9 não é um repositório git' })
  })

  it('getHealth fetches /health at the root (no /api/v1 prefix, no API key)', async () => {
    setApiKey('secret')
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ status: 'ok', version: '6.0.0' }), { status: 200 }))
    const res = await getHealth()
    expect(res).toEqual({ status: 'ok', version: '6.0.0' })
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toBe('/health')
    const headers = (init?.headers ?? {}) as Record<string, string>
    expect(headers['X-API-Key']).toBeUndefined()
  })

  it('getHealth throws ApiError when the engine is unreachable', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ detail: 'down' }), { status: 503 }))
    await expect(getHealth()).rejects.toMatchObject({ status: 503 })
  })

  it('getRunArtifacts chama GET /runs/{id}/artifacts', async () => {
    const payload: ArtifactsResponse = { run_id: 'r1', node_artifacts: {}, tokens: [], degraded: false, lessons: [] }
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }))
    const res = await getRunArtifacts('r1')
    expect(res.run_id).toBe('r1')
    expect(res.node_artifacts).toEqual({})
    expect(res.tokens).toEqual([])
    expect(res.lessons).toEqual([])
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/runs/r1/artifacts'), expect.anything())
  })

  it('getRunArtifacts URL-encodes o id da run', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ run_id: 'r1', node_artifacts: {}, tokens: [], degraded: false, lessons: [] }), { status: 200 }))
    await getRunArtifacts('run abc/1')
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain('/api/v1/runs/run%20abc%2F1/artifacts')
  })

  it('getRunArtifacts retorna tokens + lessons + circuit_breaker quando presentes', async () => {
    const payload: ArtifactsResponse = {
      run_id: 'r2',
      node_artifacts: { developer: { output: { code: 'x' } } },
      tokens: [{ node: 'developer', model: 'm', prompt_tokens: 10, completion_tokens: 5, cost_usd: 0.01, estimated: false }],
      degraded: true,
      degraded_reason: 'llm falhou',
      circuit_breaker: { state: 'open', consecutive_failures: 3, total_iterations: 5, total_cost: 0.02 },
      lessons: [{ id: 1, run_id: 'r2', lesson_text: 'use pydantic', created_at: 1700000000 }],
    }
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }))
    const res = await getRunArtifacts('r2')
    expect(res.degraded).toBe(true)
    expect(res.degraded_reason).toBe('llm falhou')
    expect(res.node_artifacts.developer.output).toEqual({ code: 'x' })
    expect(res.tokens[0].node).toBe('developer')
    expect(res.circuit_breaker?.state).toBe('open')
    expect(res.lessons[0].lesson_text).toBe('use pydantic')
  })

  // ─── Agents (S2) — CRUD /api/v1/agents ──────────────────────────────────
  const agentFixture = {
    id: 'a1',
    name: 'QA Lead',
    description: 'quality gate',
    prompt: 'you are qa',
    model: 'default',
    temperature: 0.7,
    max_retries: 2,
    timeout_seconds: 300,
    env_vars: { FOO: 'bar' },
    tools_allowlist: ['fs.read'],
    permissions: ['read'],
    stack: 'python',
    budget_usd: 10.5,
    created_at: '2026-08-14T00:00:00',
    updated_at: '2026-08-14T00:00:00',
  }

  it('listAgents GETs /api/v1/agents and parses the array', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify([agentFixture]), { status: 200 }))
    const res = await listAgents()
    expect(res).toHaveLength(1)
    expect(res[0].id).toBe('a1')
    expect(res[0].budget_usd).toBe(10.5)
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/agents'), expect.anything())
  })

  it('getAgent GETs /api/v1/agents/{id}', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(agentFixture), { status: 200 }))
    const res = await getAgent('a1')
    expect(res.name).toBe('QA Lead')
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/agents/a1'), expect.anything())
  })

  it('createAgent POSTs the AgentInput body with Content-Type json', async () => {
    const { id: _id, created_at: _c, updated_at: _u, ...input } = agentFixture
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(agentFixture), { status: 201 }))
    const res = await createAgent(input)
    expect(res.id).toBe('a1')
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain('/api/v1/agents')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual(input)
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('updateAgent PUTs a partial AgentInput to /api/v1/agents/{id}', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ...agentFixture, temperature: 0.9 }), { status: 200 }))
    const res = await updateAgent('a1', { temperature: 0.9 })
    expect(res.temperature).toBe(0.9)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain('/api/v1/agents/a1')
    expect(init?.method).toBe('PUT')
    expect(JSON.parse(String(init?.body))).toEqual({ temperature: 0.9 })
  })

  it('deleteAgent DELETEs /api/v1/agents/{id} and resolves void', async () => {
    // Backend (task-2): DELETE /{agent_id} → {"deleted": true} (200 JSON).
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ deleted: true }), { status: 200 }))
    await expect(deleteAgent('a1')).resolves.not.toThrow()
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain('/api/v1/agents/a1')
    expect(init?.method).toBe('DELETE')
  })

  it('agents 422 propagates ApiError {status: 422}', async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ detail: [{ loc: ['body', 'name'], msg: 'missing' }] }), { status: 422 }))
    await expect(createAgent({ name: '' } as never)).rejects.toMatchObject({ status: 422 })
  })
})
