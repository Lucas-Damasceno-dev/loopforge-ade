import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BudgetPill } from '../BudgetPill'
import { getRunCost } from '../../../shared/lib/api'
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
})
