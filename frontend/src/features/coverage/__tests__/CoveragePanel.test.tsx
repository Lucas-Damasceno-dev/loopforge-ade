import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CoveragePanel } from '../CoveragePanel'
import type { CoverageReportResponse } from '../../../shared/lib/types'

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderPanel(runId: string | null = 'run-cov-1') {
  return render(
    <QueryClientProvider client={makeClient()}>
      <CoveragePanel open runId={runId} onClose={() => {}} />
    </QueryClientProvider>,
  )
}

const covFixture: CoverageReportResponse = {
  run_id: 'run-cov-1',
  total_lines: 100,
  covered_lines: 85,
  coverage_percentage: 85.0,
  source: 'report',
  files: [
    {
      file_path: 'src/calculator.py',
      total_lines: 50,
      covered_lines: 45,
      missed_lines: 5,
      percentage: 90.0,
    },
    {
      file_path: 'src/utils.py',
      total_lines: 50,
      covered_lines: 40,
      missed_lines: 10,
      percentage: 80.0,
    },
  ],
}

describe('CoveragePanel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders coverage metrics and file breakdown table', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(covFixture))

    renderPanel('run-cov-1')

    await waitFor(() => {
      expect(screen.getByText('Test Code Coverage')).toBeInTheDocument()
      expect(screen.getByText('85%')).toBeInTheDocument()
      expect(screen.getByText('100')).toBeInTheDocument()
      expect(screen.getByText('src/calculator.py')).toBeInTheDocument()
      expect(screen.getByText('90%')).toBeInTheDocument()
      expect(screen.getByText('src/utils.py')).toBeInTheDocument()
      expect(screen.getByText('80%')).toBeInTheDocument()
    })
  })

  it('shows placeholders instead of fake 0 values before data loads', () => {
    renderPanel('run-cov-1')
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4)
  })

  it('shows "Select a run first" when runId is null and does not fetch', () => {
    renderPanel(null)
    expect(screen.getByText('Select a run first')).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })
})
