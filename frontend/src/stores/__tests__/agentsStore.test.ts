import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { useAgentsStore } from '../agentsStore'
import { listAgents, createAgent, updateAgent, deleteAgent, ApiError } from '../../shared/lib/api'
import type { Agent, AgentInput } from '../../shared/lib/types'

vi.mock('../../shared/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/lib/api')>()
  return {
    ...actual,
    listAgents: vi.fn(),
    createAgent: vi.fn(),
    updateAgent: vi.fn(),
    deleteAgent: vi.fn(),
  }
})

const agent = (over: Partial<Agent> = {}): Agent => ({
  id: 'a1',
  name: 'QA Lead',
  description: 'quality gate',
  prompt: 'you are qa',
  model: 'default',
  temperature: 0.7,
  max_retries: 2,
  timeout_seconds: 300,
  env_vars: {},
  tools_allowlist: [],
  permissions: [],
  stack: 'python',
  budget_usd: 10,
  created_at: '2026-08-14T00:00:00',
  updated_at: '2026-08-14T00:00:00',
  ...over,
})

const input = (over: Partial<AgentInput> = {}): AgentInput => ({
  name: 'QA Lead',
  description: 'quality gate',
  prompt: 'you are qa',
  model: 'default',
  temperature: 0.7,
  max_retries: 2,
  timeout_seconds: 300,
  env_vars: {},
  tools_allowlist: [],
  permissions: [],
  stack: 'python',
  budget_usd: 10,
  ...over,
})

beforeEach(() => {
  vi.mocked(listAgents).mockReset()
  vi.mocked(createAgent).mockReset()
  vi.mocked(updateAgent).mockReset()
  vi.mocked(deleteAgent).mockReset()
  useAgentsStore.setState({ agents: [], loading: false, error: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('agentsStore (S2)', () => {
  it('fetchAgents popula agents e flips loading', async () => {
    vi.mocked(listAgents).mockResolvedValue([agent(), agent({ id: 'a2', name: 'AppSec' })])
    const p = useAgentsStore.getState().fetchAgents()
    expect(useAgentsStore.getState().loading).toBe(true)
    await p
    expect(useAgentsStore.getState().loading).toBe(false)
    expect(useAgentsStore.getState().agents).toHaveLength(2)
    expect(useAgentsStore.getState().agents[1].name).toBe('AppSec')
  })

  it('fetchAgents falha → error friendly EN, lista intacta', async () => {
    vi.mocked(listAgents).mockRejectedValue(new Error('network down'))
    await useAgentsStore.getState().fetchAgents()
    expect(useAgentsStore.getState().error).toBe('Failed to load agents')
    expect(useAgentsStore.getState().agents).toEqual([])
  })

  it('createAgent faz append e limpa error', async () => {
    useAgentsStore.setState({ error: 'stale' })
    vi.mocked(createAgent).mockResolvedValue(agent())
    const created = await useAgentsStore.getState().createAgent(input())
    expect(created.id).toBe('a1')
    expect(useAgentsStore.getState().agents).toEqual([agent()])
    expect(useAgentsStore.getState().error).toBeNull()
  })

  it('updateAgent substitui o agente no lugar', async () => {
    useAgentsStore.setState({ agents: [agent(), agent({ id: 'a2', name: 'AppSec' })] })
    vi.mocked(updateAgent).mockResolvedValue(agent({ temperature: 0.9 }))
    const updated = await useAgentsStore.getState().updateAgent('a1', { temperature: 0.9 })
    expect(updated.temperature).toBe(0.9)
    const agents = useAgentsStore.getState().agents
    expect(agents).toHaveLength(2)
    expect(agents[0].temperature).toBe(0.9)
    expect(agents[0].name).toBe('QA Lead')
    expect(agents[1].id).toBe('a2')
  })

  it('deleteAgent remove da lista', async () => {
    useAgentsStore.setState({ agents: [agent(), agent({ id: 'a2' })] })
    vi.mocked(deleteAgent).mockResolvedValue(undefined)
    await useAgentsStore.getState().deleteAgent('a1')
    expect(useAgentsStore.getState().agents.map((a) => a.id)).toEqual(['a2'])
  })

  it('deleteAgent sem agentes → no-op sem crash', async () => {
    vi.mocked(deleteAgent).mockResolvedValue(undefined)
    await expect(useAgentsStore.getState().deleteAgent('ghost')).resolves.toBeUndefined()
    expect(useAgentsStore.getState().agents).toEqual([])
  })

  it('422 → error friendly EN + detail no console, NÃO muta lista', async () => {
    const detail = [{ loc: ['body', 'name'], msg: 'already exists' }]
    useAgentsStore.setState({ agents: [agent()] })
    vi.mocked(createAgent).mockRejectedValue(new ApiError(422, detail))
    // A ação seta `error` e re-throws (caller decide UX); capturar a rejection.
    await useAgentsStore.getState().createAgent(input()).catch(() => {})
    expect(useAgentsStore.getState().error).toBe('The server rejected the agent (HTTP 422)')
    expect(console.error).toHaveBeenCalled()
    expect(useAgentsStore.getState().agents).toHaveLength(1)
  })

  it('erro genérico → Failed to save agent (HTTP status)', async () => {
    vi.mocked(createAgent).mockRejectedValue(new ApiError(500, 'boom'))
    await useAgentsStore.getState().createAgent(input()).catch(() => {})
    expect(useAgentsStore.getState().error).toBe('Failed to save agent (HTTP 500)')
  })

  it('deleteAgent 404 → error friendly, lista intacta', async () => {
    useAgentsStore.setState({ agents: [agent()] })
    vi.mocked(deleteAgent).mockRejectedValue(new ApiError(404, 'not found'))
    await useAgentsStore.getState().deleteAgent('a1').catch(() => {})
    expect(useAgentsStore.getState().error).toBe('Failed to delete agent (HTTP 404)')
    expect(useAgentsStore.getState().agents).toHaveLength(1)
  })
})
