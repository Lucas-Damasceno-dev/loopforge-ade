import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HealthPanel } from '../HealthPanel'
import type { EvalsSummary, HealthStatus } from '../../../shared/lib/types'

// Mesmo padrão de EvalsPanel.test.tsx: fetch stubado, QueryClient sem retry,
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
      <HealthPanel open onClose={() => {}} />
    </QueryClientProvider>,
  )
}

const healthFixture: HealthStatus = { status: 'ok', version: '6.0.0' }

const evalsFixture: EvalsSummary = {
  total_runs: 4,
  pass_rate: 0.5,
  avg_duration_seconds: 30,
  total_cost_usd: 1.5,
  benchmark_runs: 2,
  avg_pass_rate: 0.5,
  current_elo: 1250.0,
  status: 'ok',
}

describe('HealthPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('polls /health and renders status + version, and combines engine telemetry status', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(healthFixture))
      .mockResolvedValueOnce(jsonResponse(evalsFixture))
    renderPanel()
    await waitFor(() => expect(screen.getByTestId('health-status')).toHaveTextContent('Operational'))
    expect(screen.getByTestId('health-version')).toHaveTextContent('v6.0.0')
    expect(screen.getByTestId('health-engine-status')).toHaveTextContent('Telemetry ok')
    expect(fetch).toHaveBeenCalledWith('/health', expect.anything())
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/evals/summary'), expect.anything())
  })

  it('shows unreachable alert when /health fails', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ detail: 'down' }, 503))
      .mockResolvedValueOnce(jsonResponse(evalsFixture))
    renderPanel()
    await waitFor(() => expect(screen.getByTestId('health-unreachable')).toHaveTextContent(/unreachable/i))
  })
})
