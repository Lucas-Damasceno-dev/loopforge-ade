import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PipelinesPanel } from '../PipelinesPanel'
import { usePipelinesStore } from '../../../stores/pipelinesStore'
import { useAuthStore } from '../../../stores/authStore'
import { listPipelines, createPipeline, updatePipeline, deletePipeline } from '../../../shared/lib/api'

// Mock de api com spread do módulo real (padrão PipelinesPanel.test.tsx) —
// authStore mantém imports reais; tests só usam useAuthStore.setState.
vi.mock('../../../shared/lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../shared/lib/api')>()
  return {
    ...mod,
    listPipelines: vi.fn(),
    createPipeline: vi.fn(),
    updatePipeline: vi.fn(),
    deletePipeline: vi.fn(),
  }
})

const pipeline = {
  id: 'p1',
  name: 'CI Pipeline',
  description: 'Build and test the workspace.',
  nodes: [{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }],
  edges: [{ id: 'e1' }, { id: 'e2' }],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

beforeEach(() => {
  usePipelinesStore.setState({ pipelines: [], loading: false, error: null })
  useAuthStore.setState({ principal: null })
  vi.mocked(listPipelines).mockResolvedValue([])
  vi.mocked(createPipeline).mockReset()
  vi.mocked(updatePipeline).mockReset()
  vi.mocked(deletePipeline).mockReset()
})

// Cobertura dos gates de role do PipelinesPanel (T6, fix round 1): CRUD é
// admin-only; viewer vê a biblioteca read-only. Padrão: store real +
// useAuthStore.setState({principal}).
describe('PipelinesPanel — gates de role (RBAC)', () => {
  it('viewer: lista vazia → EmptyState SEM ação de criar (New pipeline ausente)', async () => {
    useAuthStore.setState({ principal: { name: 'viewer', roles: ['viewer'] } })
    render(<PipelinesPanel />)
    expect(await screen.findByText('No pipelines yet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /create pipeline/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /new pipeline/i })).not.toBeInTheDocument()
  })

  it('viewer: clique no pipeline NÃO abre form (sem Name/Save/Delete/Edit-in-canvas)', async () => {
    useAuthStore.setState({ principal: { name: 'viewer', roles: ['viewer'] } })
    vi.mocked(listPipelines).mockResolvedValue([pipeline] as never)
    render(<PipelinesPanel />)
    fireEvent.click(await screen.findByText('CI Pipeline'))
    // Lista read-only: startEdit é gateado → form nunca abre → nenhuma ação
    // admin visível (Save oculto, Delete nos 2 estados ausente, hint do canvas ausente).
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^delete pipeline$/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/edit in canvas/i)).not.toBeInTheDocument()
  })

  it('admin: lista vazia → New pipeline + CTA do EmptyState abrem o form', async () => {
    useAuthStore.setState({ principal: { name: 'admin', roles: ['admin'] } })
    render(<PipelinesPanel />)
    await screen.findByText('No pipelines yet')
    // EmptyState com action (CTA) + botão do header.
    expect(screen.getByRole('button', { name: /create pipeline/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /new pipeline/i }))
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument()
  })

  it('admin: edição abre form (Save/Delete/Edit-in-canvas); delete com confirm (2 estados)', async () => {
    useAuthStore.setState({ principal: { name: 'admin', roles: ['admin'] } })
    vi.mocked(listPipelines).mockResolvedValue([pipeline] as never)
    vi.mocked(deletePipeline).mockResolvedValue(undefined as never)
    render(<PipelinesPanel />)
    fireEvent.click(await screen.findByText('CI Pipeline'))
    expect(screen.getByDisplayValue('CI Pipeline')).toBeInTheDocument()
    expect(screen.getByText(/edit in canvas/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument()
    // Delete: estado 1 (botão) → estado 2 (confirm inline) → remove.
    fireEvent.click(screen.getByRole('button', { name: /^delete pipeline$/i }))
    expect(screen.getByText(/delete ci pipeline\?/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }))
    expect(deletePipeline).toHaveBeenCalledWith('p1')
    expect(await screen.findByText('No pipelines yet')).toBeInTheDocument()
  })
})
