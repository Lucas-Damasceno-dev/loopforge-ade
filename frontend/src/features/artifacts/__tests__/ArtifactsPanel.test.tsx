import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ArtifactsPanel } from '../ArtifactsPanel'
import type { RunFilesResponse } from '../../../shared/lib/types'

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderPanel(runId: string | null = 'run-art-1') {
  return render(
    <QueryClientProvider client={makeClient()}>
      <ArtifactsPanel open runId={runId} onClose={() => {}} />
    </QueryClientProvider>,
  )
}

const filesFixture: RunFilesResponse = {
  run_id: 'run-art-1',
  files: [
    { path: 'src/app.py', size: 120, content: '- item\n+ another\nplain line', is_binary: false },
    { path: 'docs/README.md', size: 40, content: '# Project\n- todo item', is_binary: false },
  ],
}

describe('ArtifactsPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows "Select a run first" when runId is null and does not fetch', () => {
    renderPanel(null)
    expect(screen.getByText('Select a run first')).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('renders files and content without a fake Diff tab', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(filesFixture))
    renderPanel('run-art-1')
    await waitFor(() => expect(screen.getAllByText('src/app.py').length).toBeGreaterThan(0))
    expect(screen.queryByRole('button', { name: 'Diff' })).not.toBeInTheDocument()
    expect(screen.getByText('- item')).toBeInTheDocument()
    expect(screen.getByText('+ another')).toBeInTheDocument()
  })
})
