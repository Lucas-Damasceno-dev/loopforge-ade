import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RunInspector } from '../RunInspector'
import { getRunCost } from '../../../shared/lib/api'
import { useRunsStore } from '../../../stores/runsStore'
import { PIPELINE_ORDER } from '../dagModel'

vi.mock('../../../shared/lib/api', () => ({
  getRunCost: vi.fn(),
}))

// Inspetor de run (T5): coluna fixa à direita do main (w-[var(--inspector-w)]),
// colapsável (chevrão no header — padrão ConsolePanel), seções Run details +
// Budget & Cost (mesma query ['run-cost', runId] do BudgetPill — dedupe).
function renderInspector() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <RunInspector />
    </QueryClientProvider>,
  )
}

const runningRun = { id: 'run-1', idea: 'x', stack: 'python', status: 'running' as const, duration_seconds: 252, current_node: 'developer' }

const costMock = {
  run_id: 'run-1',
  spent_usd: 0.42,
  estimated: false,
  budget: { max_usd: 1, percent_used: 0.42 },
  nodes: [{ node: 'developer', spent_usd: 0.08 }],
}

describe('RunInspector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useRunsStore.setState({ runs: [], activeRunId: null, queue: [], past: [], future: [] })
  })

  it('run ativa + cost mock → Run details + status + rows de custo (PIPELINE_ORDER)', async () => {
    useRunsStore.setState({ runs: [runningRun], activeRunId: 'run-1' })
    vi.mocked(getRunCost).mockResolvedValue(costMock as never)
    renderInspector()

    expect(await screen.findByText('Run details')).toBeInTheDocument()
    // Badge de status + id curto mono.
    expect(screen.getByText('running')).toBeInTheDocument()
    expect(screen.getByText('run-1')).toBeInTheDocument()
    // Dado de custo chegou (spent / max) antes de contar as rows.
    expect(await screen.findByText('$0.42 / $1.00')).toBeInTheDocument()
    // Custo por nó: uma row por nó do backbone + valor formatado (2 casas).
    expect(document.querySelectorAll('[data-cost-row]')).toHaveLength(PIPELINE_ORDER.length)
    expect(screen.getByText('$0.08')).toBeInTheDocument()
  })

  it('chevrão colapsa: aria-expanded=false e rows ausentes', async () => {
    useRunsStore.setState({ runs: [runningRun], activeRunId: 'run-1' })
    vi.mocked(getRunCost).mockResolvedValue(costMock as never)
    renderInspector()

    await screen.findByText('Run details')
    await screen.findByText('$0.42 / $1.00')
    expect(document.querySelectorAll('[data-cost-row]')).toHaveLength(PIPELINE_ORDER.length)
    const toggle = screen.getByRole('button', { name: /collapse/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(document.querySelectorAll('[data-cost-row]')).toHaveLength(0)
    expect(screen.queryByText('Run details')).not.toBeInTheDocument()
  })

  it('sem run ativa → empty discreto', () => {
    renderInspector()
    expect(screen.getByText(/no active run/i)).toBeInTheDocument()
  })

  it('run com pipeline_name → badge "Pipeline: <name>" no Run details', async () => {
    useRunsStore.setState({ runs: [{ ...runningRun, pipeline_id: 'p1', pipeline_name: 'Main flow' }], activeRunId: 'run-1' })
    vi.mocked(getRunCost).mockResolvedValue(costMock as never)
    renderInspector()
    expect(await screen.findByText('Run details')).toBeInTheDocument()
    expect(screen.getByText('Pipeline: Main flow')).toBeInTheDocument()
  })

  it('run sem pipeline → badge ausente', async () => {
    useRunsStore.setState({ runs: [runningRun], activeRunId: 'run-1' })
    vi.mocked(getRunCost).mockResolvedValue(costMock as never)
    renderInspector()
    expect(await screen.findByText('Run details')).toBeInTheDocument()
    expect(screen.queryByText(/pipeline:/i)).not.toBeInTheDocument()
  })
})
