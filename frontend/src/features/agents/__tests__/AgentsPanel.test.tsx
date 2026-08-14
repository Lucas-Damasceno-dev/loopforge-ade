import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AgentsPanel } from '../AgentsPanel'
import { useAgentsStore } from '../../../stores/agentsStore'
import { listAgents, createAgent, updateAgent, deleteAgent, ApiError } from '../../../shared/lib/api'

vi.mock('../../../shared/lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../shared/lib/api')>()
  return {
    ...mod,
    listAgents: vi.fn(),
    createAgent: vi.fn(),
    updateAgent: vi.fn(),
    deleteAgent: vi.fn(),
  }
})

const agent = {
  id: 'a1',
  name: 'Code Reviewer',
  description: 'Reviews the diff',
  prompt: 'Review the code and report findings.',
  model: 'gpt-4o',
  temperature: 0.2,
  max_retries: 2,
  timeout_seconds: 60,
  env_vars: { KEY: 'val' },
  tools_allowlist: ['read'],
  permissions: ['repo:read'],
  stack: 'python',
  budget_usd: 5,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

beforeEach(() => {
  useAgentsStore.setState({ agents: [], loading: false, error: null })
  vi.mocked(listAgents).mockResolvedValue([])
  vi.mocked(createAgent).mockReset()
  vi.mocked(updateAgent).mockReset()
  vi.mocked(deleteAgent).mockReset()
})

describe('AgentsPanel', () => {
  it('lista renderiza agentes (nome, stack, model, budget)', async () => {
    vi.mocked(listAgents).mockResolvedValue([agent])
    render(<AgentsPanel />)
    expect(await screen.findByText('Code Reviewer')).toBeInTheDocument()
    expect(screen.getByText('python')).toBeInTheDocument()
    expect(screen.getByText('gpt-4o')).toBeInTheDocument()
    expect(screen.getByText(/\$5/)).toBeInTheDocument()
  })

  it('vazio → EmptyState compacto + CTA "Create agent" abre o form', async () => {
    render(<AgentsPanel />)
    expect(await screen.findByText('No agents yet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /create agent/i }))
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Prompt')).toBeInTheDocument()
  })

  it('"+ New agent" abre form; submit cria e volta para a lista', async () => {
    vi.mocked(createAgent).mockResolvedValue({ ...agent, id: 'a2', name: 'Tester', prompt: 'Write tests.' } as never)
    render(<AgentsPanel />)
    await screen.findByText('No agents yet')
    fireEvent.click(screen.getByRole('button', { name: /create agent/i }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Tester' } })
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'Write tests.' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(await screen.findByText('Tester')).toBeInTheDocument()
    expect(createAgent).toHaveBeenCalledWith(expect.objectContaining({ name: 'Tester', prompt: 'Write tests.' }))
  })

  it('editar selecionado preenche o form; save chama updateAgent', async () => {
    vi.mocked(listAgents).mockResolvedValue([agent])
    vi.mocked(updateAgent).mockResolvedValue({ ...agent, name: 'Code Reviewer v2' } as never)
    render(<AgentsPanel />)
    fireEvent.click(await screen.findByText('Code Reviewer'))
    expect(screen.getByDisplayValue('Code Reviewer')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Code Reviewer v2' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(updateAgent).toHaveBeenCalledWith('a1', expect.objectContaining({ name: 'Code Reviewer v2' }))
    expect(await screen.findByText('Code Reviewer v2')).toBeInTheDocument()
  })

  it('422 → mensagem amigável inline (role=alert)', async () => {
    vi.mocked(createAgent).mockRejectedValue(new ApiError(422, [{ loc: ['prompt'], msg: 'too short' }]))
    render(<AgentsPanel />)
    await screen.findByText('No agents yet')
    fireEvent.click(screen.getByRole('button', { name: /create agent/i }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Tester' } })
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/rejected the agent \(HTTP 422\)/i)
  })

  it('delete com confirm inline remove o agente', async () => {
    vi.mocked(listAgents).mockResolvedValue([agent])
    vi.mocked(deleteAgent).mockResolvedValue(undefined as never)
    render(<AgentsPanel />)
    fireEvent.click(await screen.findByText('Code Reviewer'))
    fireEvent.click(screen.getByRole('button', { name: /^delete agent$/i }))
    // Confirm inline (estado, não window.confirm).
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }))
    expect(deleteAgent).toHaveBeenCalledWith('a1')
    expect(await screen.findByText('No agents yet')).toBeInTheDocument()
  })

  it('validação local: name/prompt obrigatórios sem chamar a API', async () => {
    render(<AgentsPanel />)
    await screen.findByText('No agents yet')
    fireEvent.click(screen.getByRole('button', { name: /create agent/i }))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/name and prompt are required/i)
    expect(createAgent).not.toHaveBeenCalled()
  })
})
