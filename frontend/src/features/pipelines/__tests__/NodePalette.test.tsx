import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NodePalette } from '../NodePalette'
import { useEditorStore } from '../editorStore'
import { useAgentsStore } from '../../../stores/agentsStore'
import { listAgents } from '../../../shared/lib/api'

vi.mock('../../../shared/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../shared/lib/api')>()
  return {
    ...actual,
    listAgents: vi.fn(),
  }
})

const agent = (over: Partial<{ id: string; name: string }> = {}) => ({
  id: over.id ?? 'a1',
  name: over.name ?? 'QA Lead',
  description: 'd',
  prompt: 'p',
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
})

beforeEach(() => {
  useEditorStore.setState({ open: true, editingId: null, draft: { name: '', description: '', nodes: [], edges: [] }, live: false, selectedEdgeId: null, positions: {} })
  useAgentsStore.setState({ agents: [], loading: false, error: null })
  vi.mocked(listAgents).mockReset()
  vi.mocked(listAgents).mockResolvedValue([agent(), agent({ id: 'a2', name: 'AppSec' })])
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('NodePalette (S3)', () => {
  it('renderiza tipos do editor + agentes da biblioteca', async () => {
    render(<NodePalette />)
    await waitFor(() => expect(screen.getByText('QA Lead')).toBeInTheDocument())
    expect(screen.getByText('AppSec')).toBeInTheDocument()
    expect(screen.getByText('Split')).toBeInTheDocument()
    expect(screen.getByText('Merge')).toBeInTheDocument()
    expect(screen.getByText('Gate')).toBeInTheDocument()
    expect(screen.getByText('Input')).toBeInTheDocument()
    expect(screen.getByText('Output')).toBeInTheDocument()
  })

  it('clique em tipo adiciona nó ao draft', async () => {
    render(<NodePalette />)
    fireEvent.click(await screen.findByText('Split'))
    expect(useEditorStore.getState().draft!.nodes).toHaveLength(1)
    expect(useEditorStore.getState().draft!.nodes[0].type).toBe('split')
  })

  it('clique em agente adiciona nó com agent_id', async () => {
    render(<NodePalette />)
    fireEvent.click(await screen.findByText('QA Lead'))
    const node = useEditorStore.getState().draft!.nodes[0]
    expect(node.type).toBe('agent')
    expect(node.agent_id).toBe('a1')
  })
})
