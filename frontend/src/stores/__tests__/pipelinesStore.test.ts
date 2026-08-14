import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { usePipelinesStore } from '../pipelinesStore'
import { listPipelines, createPipeline, updatePipeline, deletePipeline, validatePipeline, ApiError } from '../../shared/lib/api'
import type { Pipeline, PipelineInput } from '../../shared/lib/types'

vi.mock('../../shared/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/lib/api')>()
  return {
    ...actual,
    listPipelines: vi.fn(),
    createPipeline: vi.fn(),
    updatePipeline: vi.fn(),
    deletePipeline: vi.fn(),
    validatePipeline: vi.fn(),
  }
})

const pipeline = (over: Partial<Pipeline> = {}): Pipeline => ({
  id: 'p1',
  name: 'Main flow',
  description: 'default pipeline',
  nodes: [
    { id: 'entry', type: 'input', agent_id: null, config: {} },
    { id: 'dev', type: 'agent', agent_id: 'a1', config: {} },
  ],
  edges: [{ source: 'entry', target: 'dev', type: 'sequential', condition: null, max_retries: 2 }],
  created_at: '2026-08-14T00:00:00',
  updated_at: '2026-08-14T00:00:00',
  ...over,
})

const input = (over: Partial<PipelineInput> = {}): PipelineInput => {
  const { id: _id, created_at: _c, updated_at: _u, ...rest } = pipeline()
  return { ...rest, ...over }
}

beforeEach(() => {
  vi.mocked(listPipelines).mockReset()
  vi.mocked(createPipeline).mockReset()
  vi.mocked(updatePipeline).mockReset()
  vi.mocked(deletePipeline).mockReset()
  vi.mocked(validatePipeline).mockReset()
  usePipelinesStore.setState({ pipelines: [], loading: false, error: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('pipelinesStore (S3)', () => {
  it('fetchPipelines popula e flips loading', async () => {
    vi.mocked(listPipelines).mockResolvedValue([pipeline(), pipeline({ id: 'p2', name: 'Alt' })])
    const p = usePipelinesStore.getState().fetchPipelines()
    expect(usePipelinesStore.getState().loading).toBe(true)
    await p
    expect(usePipelinesStore.getState().loading).toBe(false)
    expect(usePipelinesStore.getState().pipelines).toHaveLength(2)
    expect(usePipelinesStore.getState().pipelines[1].name).toBe('Alt')
  })

  it('fetchPipelines falha → error friendly EN, lista intacta', async () => {
    vi.mocked(listPipelines).mockRejectedValue(new Error('down'))
    await usePipelinesStore.getState().fetchPipelines()
    expect(usePipelinesStore.getState().error).toBe('Failed to load pipelines')
    expect(usePipelinesStore.getState().pipelines).toEqual([])
  })

  it('createPipeline faz append e limpa error', async () => {
    usePipelinesStore.setState({ error: 'stale' })
    vi.mocked(createPipeline).mockResolvedValue(pipeline())
    const created = await usePipelinesStore.getState().createPipeline(input())
    expect(created.id).toBe('p1')
    expect(usePipelinesStore.getState().pipelines).toEqual([pipeline()])
    expect(usePipelinesStore.getState().error).toBeNull()
  })

  it('updatePipeline substitui no lugar', async () => {
    usePipelinesStore.setState({ pipelines: [pipeline(), pipeline({ id: 'p2' })] })
    vi.mocked(updatePipeline).mockResolvedValue(pipeline({ name: 'Renamed' }))
    const updated = await usePipelinesStore.getState().updatePipeline('p1', { name: 'Renamed' })
    expect(updated.name).toBe('Renamed')
    const pipelines = usePipelinesStore.getState().pipelines
    expect(pipelines).toHaveLength(2)
    expect(pipelines[0].name).toBe('Renamed')
    expect(pipelines[1].id).toBe('p2')
  })

  it('deletePipeline remove da lista', async () => {
    usePipelinesStore.setState({ pipelines: [pipeline(), pipeline({ id: 'p2' })] })
    vi.mocked(deletePipeline).mockResolvedValue(undefined)
    await usePipelinesStore.getState().deletePipeline('p1')
    expect(usePipelinesStore.getState().pipelines.map((p) => p.id)).toEqual(['p2'])
  })

  it('deletePipeline sem pipelines → no-op SEM chamar a API', async () => {
    await expect(usePipelinesStore.getState().deletePipeline('ghost')).resolves.toBeUndefined()
    expect(vi.mocked(deletePipeline)).not.toHaveBeenCalled()
    expect(usePipelinesStore.getState().pipelines).toEqual([])
  })

  it('deletePipeline 404-swallow: remove + LIMPA error stale (fix minor S2)', async () => {
    // error pré-existente (ex.: create 422) + delete 404 → error volta a null.
    usePipelinesStore.setState({ pipelines: [pipeline()], error: 'The server rejected the pipeline (HTTP 422)' })
    vi.mocked(deletePipeline).mockRejectedValue(new ApiError(404, 'not found'))
    await expect(usePipelinesStore.getState().deletePipeline('p1')).resolves.toBeUndefined()
    expect(usePipelinesStore.getState().error).toBeNull()
    expect(console.error).not.toHaveBeenCalled()
    expect(usePipelinesStore.getState().pipelines).toEqual([])
  })

  it('deletePipeline 500 → error friendly + re-throw, lista intacta', async () => {
    usePipelinesStore.setState({ pipelines: [pipeline()] })
    vi.mocked(deletePipeline).mockRejectedValue(new ApiError(500, 'boom'))
    await expect(usePipelinesStore.getState().deletePipeline('p1')).rejects.toMatchObject({ status: 500 })
    expect(usePipelinesStore.getState().error).toBe('Failed to delete pipeline (HTTP 500)')
    expect(usePipelinesStore.getState().pipelines).toHaveLength(1)
  })

  it('validatePipeline retorna ValidateResult sem throw', async () => {
    vi.mocked(validatePipeline).mockResolvedValue({ valid: false, errors: ['node x unreachable'] })
    const res = await usePipelinesStore.getState().validatePipeline('p1')
    expect(res).toEqual({ valid: false, errors: ['node x unreachable'] })
    expect(usePipelinesStore.getState().error).toBeNull()
  })

  it('validatePipeline erro → error setado + null retornado (sem throw)', async () => {
    vi.mocked(validatePipeline).mockRejectedValue(new ApiError(500, 'boom'))
    const res = await usePipelinesStore.getState().validatePipeline('p1')
    expect(res).toBeNull()
    expect(usePipelinesStore.getState().error).toBe('Failed to validate pipeline (HTTP 500)')
  })

  it('422 → error friendly EN + detail no console, NÃO muta lista', async () => {
    const detail = [{ loc: ['body', 'nodes'], msg: 'invalid' }]
    usePipelinesStore.setState({ pipelines: [pipeline()] })
    vi.mocked(createPipeline).mockRejectedValue(new ApiError(422, detail))
    await usePipelinesStore.getState().createPipeline(input()).catch(() => {})
    expect(usePipelinesStore.getState().error).toBe('The server rejected the pipeline (HTTP 422)')
    expect(console.error).toHaveBeenCalled()
    expect(usePipelinesStore.getState().pipelines).toHaveLength(1)
  })
})
