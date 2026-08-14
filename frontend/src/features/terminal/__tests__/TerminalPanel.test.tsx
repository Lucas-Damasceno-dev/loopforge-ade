import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TerminalPanel } from '../TerminalPanel'

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderPanel(runId = 'run-term-1') {
  return render(
    <QueryClientProvider client={makeClient()}>
      <TerminalPanel open runId={runId} onClose={() => {}} />
    </QueryClientProvider>,
  )
}

describe('TerminalPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders terminal status and info on mount', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ run_id: 'run-term-1', workspace_path: '/tmp/loopforge/run_run-term-1', exists: true }),
    )

    renderPanel('run-term-1')

    await waitFor(() => {
      expect(screen.getByText('Ready')).toBeInTheDocument()
      expect(screen.getByText('/tmp/loopforge/run_run-term-1')).toBeInTheDocument()
    })
  })

  it('executes command and renders stdout', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({ run_id: 'run-term-1', workspace_path: '/tmp/loopforge/run_run-term-1', exists: true }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          run_id: 'run-term-1',
          command: 'pytest -v',
          stdout: 'collected 5 items\n5 passed in 0.2s',
          stderr: '',
          exit_code: 0,
          duration_seconds: 0.21,
        }),
      )

    renderPanel('run-term-1')

    await waitFor(() => {
      expect(screen.getByText('Ready')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText(/Type a shell command/)
    fireEvent.change(input, { target: { value: 'pytest -v' } })
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))

    await waitFor(() => {
      expect(screen.getByText(/collected 5 items/)).toBeInTheDocument()
      expect(screen.getByText('exit: 0')).toBeInTheDocument()
    })
  })
})
