import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EvalsPanel } from '../EvalsPanel'
import type { EvalsLeaderboard, EvalsSummary } from '../../../shared/lib/types'

// Mesmo padrão de CostBar.test.tsx: fetch stubado, QueryClient sem retry,
// jsonResponse helper, asserts via waitFor + getByTestId.

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderPanel() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <EvalsPanel open onClose={() => {}} />
    </QueryClientProvider>,
  )
}

const summaryFixture: EvalsSummary = {
  total_runs: 4,
  pass_rate: 0.6667,
  avg_duration_seconds: 45,
  total_cost_usd: 4.25,
  benchmark_runs: 2,
  avg_pass_rate: 0.5,
  current_elo: 1310.5,
  status: 'ok',
}

const leaderboardFixture: EvalsLeaderboard = {
  status: 'ok',
  entries: [
    { run_id: 'fast-ok', stack: 'python', success: true, duration_seconds: 10, estimated_cost_usd: 0.5, timestamp: '2026-08-12T00:00:00+00:00' },
    { run_id: 'fail', stack: 'go', success: false, duration_seconds: 5, estimated_cost_usd: 0.3, timestamp: '2026-08-12T00:01:00+00:00' },
  ],
}

describe('EvalsPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders summary cards from telemetry and fetches both endpoints', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(summaryFixture))
      .mockResolvedValueOnce(jsonResponse(leaderboardFixture))
    renderPanel()
    await waitFor(() => expect(screen.getByTestId('evals-pass-rate')).toHaveTextContent('67%'))
    expect(screen.getByTestId('evals-avg-duration')).toHaveTextContent('45.0s')
    expect(screen.getByTestId('evals-total-cost')).toHaveTextContent('$4.25')
    expect(screen.getByTestId('evals-total-runs')).toHaveTextContent('4')
    expect(screen.getByTestId('evals-benchmark-runs')).toHaveTextContent('2')
    expect(screen.getByTestId('evals-bench-pass-rate')).toHaveTextContent('50%')
    expect(screen.getByTestId('evals-elo')).toHaveTextContent('1310.5')
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/evals/summary'), expect.anything())
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/evals/leaderboard'), expect.anything())
  })

  it('renders leaderboard entries with pass/fail badges, stack, duration and cost', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(summaryFixture))
      .mockResolvedValueOnce(jsonResponse(leaderboardFixture))
    renderPanel()
    const okEntry = await screen.findByTestId('evals-entry-fast-ok')
    expect(okEntry).toHaveTextContent('python')
    expect(okEntry).toHaveTextContent('Pass')
    expect(okEntry).toHaveTextContent('10.0s')
    expect(okEntry).toHaveTextContent('$0.50')
    const failEntry = screen.getByTestId('evals-entry-fail')
    expect(failEntry).toHaveTextContent('go')
    expect(failEntry).toHaveTextContent('Fail')
    expect(failEntry).toHaveTextContent('$0.30')
  })

  it('shows empty leaderboard message when there are no benchmark entries', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(summaryFixture))
      .mockResolvedValueOnce(jsonResponse({ status: 'empty', entries: [] } satisfies EvalsLeaderboard))
    renderPanel()
    await waitFor(() => expect(screen.getByTestId('evals-leaderboard-empty')).toBeInTheDocument())
    expect(screen.getByTestId('evals-leaderboard-empty')).toHaveTextContent(/no benchmark runs/i)
  })

  it('shows error alert when summary fetch fails (telemetry never 500s the UI)', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ detail: 'boom' }, 500))
      .mockResolvedValueOnce(jsonResponse(leaderboardFixture))
    renderPanel()
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/failed to load evals/i))
  })
})
