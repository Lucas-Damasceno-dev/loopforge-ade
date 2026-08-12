import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { getTrajectoryDiff, getTrajectoryCheckpoints, TrajectoryApiError } from '../trajectory'

describe('trajectory client (time-travel diff)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    localStorage.clear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const diffBody = {
    thread_id: 'run-r1',
    from: 'cp-1',
    to: 'cp-2',
    added: { extra: '{"x": 1}' },
    removed: { drop: '"bye"' },
    changed: [{ key: 'next_agent', before: '"cpo"', after: '"pm"' }],
  }

  it('getTrajectoryDiff hits /trajectories/{thread}/diff with from/to params', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(diffBody), { status: 200 }))
    const res = await getTrajectoryDiff('run-r1', 'cp-1', 'cp-2')
    expect(res.added.extra).toBe('{"x": 1}')
    expect(res.removed.drop).toBe('"bye"')
    expect(res.changed).toEqual([{ key: 'next_agent', before: '"cpo"', after: '"pm"' }])
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain('/api/v1/trajectories/run-r1/diff')
    expect(String(url)).toContain('from=cp-1')
    expect(String(url)).toContain('to=cp-2')
  })

  it('getTrajectoryDiff encodes thread id in the path', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(diffBody), { status: 200 }))
    await getTrajectoryDiff('run a/b', 'cp-1', 'cp-2')
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain('/trajectories/run%20a%2Fb/diff')
  })

  it('getTrajectoryCheckpoints hits /checkpoints?detail=1', async () => {
    const cps = [
      { thread_id: 'run-r1', checkpoint_id: 'cp-1', parent_checkpoint_id: null, ts: '2026-08-05T00:00:00Z', step: 0, node: null },
      { thread_id: 'run-r1', checkpoint_id: 'cp-2', parent_checkpoint_id: 'cp-1', ts: '2026-08-05T00:00:01Z', step: 1, node: 'cpo' },
    ]
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(cps), { status: 200 }))
    const res = await getTrajectoryCheckpoints('run-r1')
    expect(res).toHaveLength(2)
    expect(res[1].parent_checkpoint_id).toBe('cp-1')
    expect(res[1].node).toBe('cpo')
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain('/api/v1/trajectories/run-r1/checkpoints?detail=1')
  })

  it('sends X-API-Key header from localStorage (lf_api_key)', async () => {
    localStorage.setItem('lf_api_key', 'secret')
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(diffBody), { status: 200 }))
    await getTrajectoryDiff('run-r1', 'cp-1', 'cp-2')
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect((init?.headers as Record<string, string>)['X-API-Key']).toBe('secret')
  })

  it('throws TrajectoryApiError with detail on 404', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ detail: 'Checkpoint ghost não encontrado' }), { status: 404 }))
    const err = await getTrajectoryDiff('run-r1', 'ghost', 'cp-2').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(TrajectoryApiError)
    expect(err).toMatchObject({ status: 404, detail: 'Checkpoint ghost não encontrado' })
  })

  it('keeps detail null when body is not JSON', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('nope', { status: 500 }))
    await expect(getTrajectoryCheckpoints('run-r1')).rejects.toMatchObject({ status: 500, detail: null })
  })
})
