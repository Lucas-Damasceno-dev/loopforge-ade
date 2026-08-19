import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GitPanel } from '../GitPanel'
import type { GitInfo } from '../../../shared/lib/types'

// Mesmo padrão de EvalsPanel.test.tsx: fetch stubado, QueryClient sem retry,
// jsonResponse helper, asserts via waitFor + getByTestId.

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderPanel(runId = 'run-1') {
  return render(
    <QueryClientProvider client={makeClient()}>
      <GitPanel open runId={runId} onClose={() => {}} />
    </QueryClientProvider>,
  )
}

const gitFixture: GitInfo = {
  branch: 'main',
  head: 'abc1234',
  status: [
    { path: 'src/app.py', status: 'M' },
    { path: 'draft.txt', status: '??' },
  ],
  log: [
    { hash: 'abc1234', subject: 'feat: app', author: 'Test Bot', when: '2026-08-12T10:00:00+00:00' },
    { hash: 'def5678', subject: 'feat: init', author: 'Test Bot', when: '2026-08-11T09:00:00+00:00' },
  ],
}

describe('GitPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches git info for the run and renders branch, head, status and log', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(gitFixture))
    renderPanel('run-1')
    await waitFor(() => expect(screen.getByTestId('git-branch')).toHaveTextContent('main'))
    expect(screen.getByTestId('git-head')).toHaveTextContent('abc1234')
    expect(screen.getByTestId('git-status-src/app.py')).toHaveTextContent('M')
    expect(screen.getByTestId('git-status-draft.txt')).toHaveTextContent('??')
    expect(screen.getByTestId('git-log-abc1234')).toHaveTextContent('feat: app')
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/git/run-1'), expect.anything())
  })

  it('shows clean tree and empty log when no changes/commits', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ branch: 'main', head: 'abc1234', status: [], log: [] } satisfies GitInfo),
    )
    renderPanel('run-1')
    await waitFor(() => expect(screen.getByTestId('git-status-clean')).toBeInTheDocument())
    expect(screen.getByTestId('git-log-empty')).toHaveTextContent(/no commits/i)
  })

  it('shows honest error alert with HTTP status when git info fails (404)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ detail: 'Diretório da run run-1 não é um repositório git' }, 404),
    )
    renderPanel('run-1')
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/failed to load git info \(HTTP 404\)/i))
  })

  it('shows EmptyState when no run is active and does not fetch', () => {
    renderPanel('')
    expect(screen.getByText('No active run')).toBeInTheDocument()
    expect(screen.getByText(/select one from runs/i)).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not fetch while the drawer is closed', async () => {
    render(
      <QueryClientProvider client={makeClient()}>
        <GitPanel open={false} runId="run-1" onClose={() => {}} />
      </QueryClientProvider>,
    )
    expect(fetch).not.toHaveBeenCalled()
  })
})
