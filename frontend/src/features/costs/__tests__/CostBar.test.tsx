import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CostBar } from '../CostBar'
import { useRunsStore } from '../../../stores/runsStore'
import type { CostResponse, Run, RunStatus } from '../../../shared/lib/types'

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function costResponse(over: Partial<CostResponse> = {}): CostResponse {
  return {
    run_id: 'r1',
    spent_usd: 5,
    estimated: false,
    budget: { max_usd: 10, percent_used: 0.5 },
    budget_warning: false,
    ...over,
  }
}

function run(id: string, status: RunStatus): Run {
  return { id, idea: 'x', stack: '', status }
}

function renderBar(runDef?: Run) {
  useRunsStore.setState({ runs: runDef ? [runDef] : [], activeRunId: runDef?.id ?? null })
  return render(
    <QueryClientProvider client={makeClient()}>
      <CostBar />
    </QueryClientProvider>,
  )
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('CostBar', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    useRunsStore.setState({ runs: [], activeRunId: null })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches real cost for the active run and renders spent/budget', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(costResponse({ spent_usd: 5, budget: { max_usd: 10, percent_used: 0.5 } })))
    renderBar(run('r1', 'running'))
    await waitFor(() => expect(screen.getByTestId('cost-label')).toHaveTextContent('$5 / $10'))
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/runs/r1/cost'), expect.anything())
  })

  it('shows blocked modal at 100% and Give override opens the override modal', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(costResponse({ spent_usd: 10, budget: { max_usd: 10, percent_used: 1 } })))
    renderBar(run('r1', 'running'))
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Budget limit reached' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /give override/i }))
    expect(screen.getByRole('dialog', { name: 'Budget override' })).toBeInTheDocument()
  })

  it('override POSTs max_usd and refetches cost', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(costResponse({ spent_usd: 8, budget: { max_usd: 10, percent_used: 0.8 } }))) // GET inicial (80% → botão Override)
      .mockResolvedValueOnce(jsonResponse(costResponse({ spent_usd: 8, budget: { max_usd: 20, percent_used: 0.4 } }))) // POST override
      .mockResolvedValueOnce(jsonResponse(costResponse({ spent_usd: 8, budget: { max_usd: 20, percent_used: 0.4 } }))) // GET refetch
    renderBar(run('r1', 'running'))
    fireEvent.click(await screen.findByRole('button', { name: /^override$/i }))
    fireEvent.change(screen.getByLabelText(/max usd/i), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }))
    await waitFor(() => expect(screen.getByTestId('cost-label')).toHaveTextContent('$8 / $20'))
    const postCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes('/cost/override'))
    expect(postCall).toBeDefined()
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({ max_usd: 20 })
  })

  it('validates override input numerically and shows error in err-text', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(costResponse({ spent_usd: 8, budget: { max_usd: 10, percent_used: 0.8 } })))
    renderBar(run('r1', 'running'))
    fireEvent.click(await screen.findByRole('button', { name: /^override$/i }))
    fireEvent.change(screen.getByLabelText(/max usd/i), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/maior que zero/i))
  })

  it('shows compact empty state for queued/paused runs (no cost data)', () => {
    for (const status of ['queued', 'paused'] as const) {
      const { unmount } = renderBar(run('r1', status))
      expect(screen.getByTestId('cost-empty')).toBeInTheDocument()
      expect(screen.queryByTestId('cost-label')).not.toBeInTheDocument()
      expect(fetch).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('keeps controlled props path (no fetch) working', () => {
    render(
      <QueryClientProvider client={makeClient()}>
        <CostBar maxUsd={10} spentUsd={10} />
      </QueryClientProvider>,
    )
    expect(screen.getByRole('dialog', { name: 'Budget limit reached' })).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })
})
