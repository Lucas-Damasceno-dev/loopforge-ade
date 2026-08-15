import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SidebarHost } from '../SidebarHost'
import { useRunsStore } from '../../../stores/runsStore'
import { useAgentsStore } from '../../../stores/agentsStore'
import { usePipelinesStore } from '../../../stores/pipelinesStore'
import { useAuthStore } from '../../../stores/authStore'

// Painéis inline fazem fetch no mount — listas vazias por default.
vi.mock('../../../shared/lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../shared/lib/api')>()
  return {
    ...mod,
    listAgents: vi.fn().mockResolvedValue([]),
    listPipelines: vi.fn().mockResolvedValue([]),
  }
})

const queryClient = new QueryClient()

beforeEach(() => {
  useRunsStore.setState({ runs: [], activeRunId: null })
  useAgentsStore.setState({ agents: [], loading: false, error: null })
  usePipelinesStore.setState({ pipelines: [], loading: false, error: null })
})

function renderHost(active: Parameters<typeof SidebarHost>[0]['active']) {
  const onClose = vi.fn()
  const onExpand = vi.fn()
  const { rerender } = render(
    <QueryClientProvider client={queryClient}>
      <SidebarHost active={active} onClose={onClose} onExpand={onExpand} />
    </QueryClientProvider>,
  )
  return { onClose, onExpand, rerender }
}

describe('SidebarHost', () => {
  it('view leve (prompt): renderiza o NewRunForm inline', () => {
    const { onClose, onExpand } = renderHost('prompt')
    // NewRunForm expõe a textarea de ideia com aria-label="Idea".
    expect(screen.getByLabelText('Idea')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Prompt' })).toBeInTheDocument()
    // View leve não tem "Open panel".
    expect(screen.queryByRole('button', { name: /open panel/i })).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(onExpand).not.toHaveBeenCalled()
  })

  it('view pesada (artifacts): resumo + botão "Open panel" chama onExpand', () => {
    const { onExpand } = renderHost('artifacts')
    expect(screen.getByRole('heading', { name: 'Artifacts' })).toBeInTheDocument()
    // Resumo descritivo presente.
    expect(screen.getByText(/files and artifacts/i)).toBeInTheDocument()
    const open = screen.getByRole('button', { name: 'Open Artifacts panel' })
    fireEvent.click(open)
    expect(onExpand).toHaveBeenCalledOnce()
  })

  it('botão de fechar chama onClose', () => {
    const { onClose } = renderHost('artifacts')
    fireEvent.click(screen.getByRole('button', { name: 'Close Artifacts' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Esc fecha (padrão Drawer)', () => {
    const { onClose } = renderHost('settings')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('active=null não renderiza nada', () => {
    renderHost(null)
    expect(screen.queryByRole('aside')).not.toBeInTheDocument()
  })

  it('runs (resumo interativo): renderiza lista SEM botão "Open panel" (fix F1)', () => {
    renderHost('runs')
    // Resumo dinâmico do store presente (vazio → estado vazio amigável).
    expect(screen.getByText(/no runs yet/i)).toBeInTheDocument()
    // runs não tem drawer → sem affordance morta no header.
    expect(screen.queryByRole('button', { name: /open panel/i })).not.toBeInTheDocument()
  })

  it('agents: renderiza o painel real (S2) — sem placeholder, sem Open panel', async () => {
    renderHost('agents')
    // AgentsPanel (lista vazia) → EmptyState "No agents yet" + CTA.
    expect(await screen.findByText('No agents yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create agent/i })).toBeInTheDocument()
    expect(screen.queryByText(/agent studio — coming in a later phase/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /open panel/i })).not.toBeInTheDocument()
  })

  it('pipelines: renderiza o painel real (S3) — sem placeholder, sem Open panel', async () => {
    renderHost('pipelines')
    // PipelinesPanel (lista vazia) → EmptyState "No pipelines yet" + CTA.
    expect(await screen.findByText('No pipelines yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create pipeline/i })).toBeInTheDocument()
    expect(screen.queryByText(/pipeline studio — coming in a later phase/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /open panel/i })).not.toBeInTheDocument()
  })
})

// ─── RBAC: guard de view admin-only (mcp/settings → VIEW_ROLE) ──────────────

describe('SidebarHost role guard (RBAC)', () => {
  beforeEach(() => {
    useAuthStore.setState({ principal: null })
  })

  it('sem principal (BC): view admin-only (mcp) renderiza normalmente', () => {
    renderHost('mcp')
    expect(screen.getByRole('heading', { name: 'MCP playground' })).toBeInTheDocument()
  })

  it('viewer: active=mcp → guard retorna null (nada renderizado)', () => {
    useAuthStore.setState({ principal: { name: 'viewer', roles: ['viewer'] } })
    renderHost('mcp')
    expect(screen.queryByRole('aside')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'MCP playground' })).not.toBeInTheDocument()
  })
})
