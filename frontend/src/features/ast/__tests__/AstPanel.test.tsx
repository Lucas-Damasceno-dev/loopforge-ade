import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AstPanel } from '../AstPanel'
import type { AstAnalysisResponse } from '../../../shared/lib/types'

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderPanel(runId = 'run-ast-1') {
  return render(
    <QueryClientProvider client={makeClient()}>
      <AstPanel open runId={runId} onClose={() => {}} />
    </QueryClientProvider>,
  )
}

const astFixture: AstAnalysisResponse = {
  run_id: 'run-ast-1',
  external_packages: ['fastapi', 'pydantic'],
  dependency_graph: [{ source_file: 'main.py', target_module: 'fastapi', import_type: 'external' }],
  modules: [
    {
      file_path: 'main.py',
      language: 'python',
      total_lines: 45,
      imports: ['fastapi', 'pydantic'],
      symbols: [
        { name: 'AppConfig', kind: 'class', line_number: 10, docstring: 'Main app config' },
        { name: 'start_server', kind: 'async_function', line_number: 25, docstring: null },
      ],
    },
  ],
}

describe('AstPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders AST modules, symbols, and external packages', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(astFixture))

    renderPanel('run-ast-1')

    await waitFor(() => {
      expect(screen.getByText('AST & Module Dependencies')).toBeInTheDocument()
      expect(screen.getAllByText('main.py').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('AppConfig')).toBeInTheDocument()
      expect(screen.getByText('start_server')).toBeInTheDocument()
      expect(screen.getByText('fastapi')).toBeInTheDocument()
      expect(screen.getByText('pydantic')).toBeInTheDocument()
    })
  })
})
