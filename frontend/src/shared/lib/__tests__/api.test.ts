import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { createRun, listRuns, apiFetch, ApiError } from '../api'

describe('api client', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('listRuns parses RunListResponse', async () => {
    const body = { items: [{ id: 'r1', idea: 'x', status: 'pending' }], total: 1 }
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))
    const res = await listRuns()
    expect(res.items).toHaveLength(1)
    expect(res.total).toBe(1)
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/runs'), expect.anything())
  })
  it('createRun POSTs JSON body', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ id: 'r2', idea: 'hi', status: 'pending' }), { status: 200 }))
    const run = await createRun('hi')
    expect(run.id).toBe('r2')
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ idea: 'hi' })
  })
  it('throws ApiError with detail on non-2xx', async () => {
    // Response é single-use (corpo consumido no primeiro apiFetch) — mock
    // devolve uma Response nova a cada chamada.
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ detail: 'boom' }), { status: 422 }))
    await expect(apiFetch('/runs')).rejects.toThrow(ApiError)
    await expect(apiFetch('/runs')).rejects.toMatchObject({ status: 422, detail: 'boom' })
  })
})
