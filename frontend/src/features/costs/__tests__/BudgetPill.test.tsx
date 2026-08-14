import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BudgetPill } from '../BudgetPill'
import { getRunCost, overrideRunBudget } from '../../../shared/lib/api'
import { useRunsStore } from '../../../stores/runsStore'
import { useBudgetOverrideStore } from '../budgetOverrideStore'

vi.mock('../../../shared/lib/api', () => ({
  getRunCost: vi.fn(),
  overrideRunBudget: vi.fn(),
}))

// Pill flutuante de orçamento (T4): mesma query ['run-cost', runId] do
// CostBar (react-query dedupe), mini-meter de 4 segmentos e override via
// onOverride. Estados: dado presente → rótulo + segmentos; sem dado → dot.
function renderPill(props: Partial<Parameters<typeof BudgetPill>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BudgetPill runId={null} onOverride={vi.fn()} {...props} />
    </QueryClientProvider>,
  )
}

const runningRun = { id: 'run-1', idea: 'x', stack: 'python', status: 'running' as const }

describe('BudgetPill', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useBudgetOverrideStore.setState({ open: false, runId: null })
    useRunsStore.setState({ runs: [], activeRunId: null, queue: [], past: [], future: [] })
  })

  it('renderiza "Budget $0.42 · $1.00" + 4 segmentos com ~42% ativos', async () => {
    useRunsStore.setState({ runs: [runningRun], activeRunId: 'run-1' })
    vi.mocked(getRunCost).mockResolvedValue({
      spent_usd: 0.42,
      budget: { max_usd: 1 },
      estimated: false,
      nodes: [],
    } as never)
    renderPill({ runId: 'run-1' })

    expect(await screen.findByText('Budget $0.42 · $1.00')).toBeInTheDocument()
    const segs = document.querySelectorAll('[data-meter]')
    expect(segs).toHaveLength(4)
    expect(document.querySelectorAll('[data-meter="on"]')).toHaveLength(2)
    expect(document.querySelectorAll('[data-meter="off"]')).toHaveLength(2)
  })

  it('sem dados de custo → dot discreto (budget-empty), sem rótulo de valor', () => {
    renderPill()
    expect(screen.getByTestId('budget-empty')).toBeInTheDocument()
    expect(screen.queryByText(/Budget \$/)).not.toBeInTheDocument()
  })

  it('clique no pill → onOverride chamado', async () => {
    useRunsStore.setState({ runs: [runningRun], activeRunId: 'run-1' })
    vi.mocked(getRunCost).mockResolvedValue({
      spent_usd: 0.42,
      budget: { max_usd: 1 },
      estimated: false,
      nodes: [],
    } as never)
    const onOverride = vi.fn()
    renderPill({ runId: 'run-1', onOverride })

    const pill = await screen.findByRole('button', { name: /Budget/ })
    fireEvent.click(pill)
    expect(onOverride).toHaveBeenCalledTimes(1)
  })

  // ── Fix round 1: testes dos modais de override/enforcement portados do
  // CostBar.test.tsx (deletado na T4) — o fluxo vive aqui agora, sem guard.

  it('nível blocked (100%) → modal "Budget limit reached"; Give override abre o modal de override', async () => {
    useRunsStore.setState({ runs: [runningRun], activeRunId: 'run-1' })
    vi.mocked(getRunCost).mockResolvedValue({
      spent_usd: 10,
      budget: { max_usd: 10 },
      estimated: false,
      nodes: [],
    } as never)
    renderPill({ runId: 'run-1' })

    expect(await screen.findByRole('dialog', { name: 'Budget limit reached' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /give override/i }))
    expect(screen.getByRole('dialog', { name: 'Budget override' })).toBeInTheDocument()
  })

  it('override POSTa max_usd e refaz o fetch do custo', async () => {
    useRunsStore.setState({ runs: [runningRun], activeRunId: 'run-1' })
    vi.mocked(getRunCost)
      .mockResolvedValueOnce({ spent_usd: 8, budget: { max_usd: 10 }, estimated: false, nodes: [] } as never) // GET inicial (80% → warn)
      .mockResolvedValueOnce({ spent_usd: 8, budget: { max_usd: 20 }, estimated: false, nodes: [] } as never) // GET pós-invalidate
    vi.mocked(overrideRunBudget).mockResolvedValue(undefined as never)
    renderPill({ runId: 'run-1', onOverride: () => useBudgetOverrideStore.getState().openOverride('run-1') })

    fireEvent.click(await screen.findByRole('button', { name: /Budget/ }))
    fireEvent.change(screen.getByLabelText(/max usd/i), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }))

    await waitFor(() => expect(screen.getByTestId('budget-label')).toHaveTextContent('Budget $8.00 · $20.00'))
    expect(overrideRunBudget).toHaveBeenCalledWith('run-1', { max_usd: 20 })
  })

  it('valida input numérico do override e mostra erro em alert (sem POST)', async () => {
    useRunsStore.setState({ runs: [runningRun], activeRunId: 'run-1' })
    vi.mocked(getRunCost).mockResolvedValue({
      spent_usd: 8,
      budget: { max_usd: 10 },
      estimated: false,
      nodes: [],
    } as never)
    renderPill({ runId: 'run-1', onOverride: () => useBudgetOverrideStore.getState().openOverride('run-1') })

    fireEvent.click(await screen.findByRole('button', { name: /Budget/ }))
    fireEvent.change(screen.getByLabelText(/max usd/i), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/greater than zero/i))
    expect(overrideRunBudget).not.toHaveBeenCalled()
  })
})
