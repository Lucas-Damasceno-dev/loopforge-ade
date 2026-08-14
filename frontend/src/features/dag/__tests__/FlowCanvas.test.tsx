import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FlowCanvas } from '../FlowCanvas'
import { useCanvasStore } from '../../../stores/canvasStore'
import { useRunsStore } from '../../../stores/runsStore'

// React Flow exige ResizeObserver e DOMMatrixReadOnly no jsdom — mockar globais.
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', RO)

class DOMMatrixReadOnlyStub {
  m11 = 1; m12 = 0; m13 = 0; m14 = 0
  m21 = 0; m22 = 1; m23 = 0; m24 = 0
  m31 = 0; m32 = 0; m33 = 1; m34 = 0
  m41 = 0; m42 = 0; m43 = 0; m44 = 1
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0
  static fromMatrix() { return new DOMMatrixReadOnlyStub() }
  static fromString() { return new DOMMatrixReadOnlyStub() }
}
vi.stubGlobal('DOMMatrixReadOnly', DOMMatrixReadOnlyStub)

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderCanvas() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <FlowCanvas />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useCanvasStore.setState({ mode: 'kanban', nodeStatus: {}, ghostToStep: null, selectedNodeId: null })
  useRunsStore.setState({ runs: [], activeRunId: null, queue: [], past: [], future: [] })
  // unstubAllGlobals() (afterEach) remove os stubs de topo — re-aplica.
  vi.stubGlobal('ResizeObserver', RO)
  vi.stubGlobal('DOMMatrixReadOnly', DOMMatrixReadOnlyStub)
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('FlowCanvas', () => {
  it('renders agent nodes with labels', () => {
    renderCanvas()
    expect(screen.getByText('Entry')).toBeInTheDocument()
    expect(screen.getByText('CPO')).toBeInTheDocument()
  })

  it('renders cost chips per node when the run cost query has nodes (Fase D)', async () => {
    // Run ativa + cost query devolve nodes → chips por nó no DAG.
    useRunsStore.setState({ runs: [{ id: 'r1', idea: 'x', stack: '', status: 'running' }], activeRunId: 'r1' })
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        run_id: 'r1',
        spent_usd: 0.62,
        estimated: true,
        budget: { max_usd: 10, percent_used: 0.06 },
        budget_warning: false,
        nodes: [
          { node: 'developer', spent_usd: 0.12, estimated: true },
          { node: 'qa', spent_usd: 0.5, estimated: false },
        ],
      }),
    )
    renderCanvas()
    // Chips com formato $X.XX e prefixo ~ quando estimated.
    expect(await screen.findByTestId('cost-chip-developer')).toHaveTextContent('~$0.12')
    expect(screen.getByTestId('cost-chip-qa')).toHaveTextContent('$0.50')
    // Nós sem custo não ganham chip (sem $0.00).
    expect(screen.queryByTestId('cost-chip-cpo')).not.toBeInTheDocument()
    expect(screen.queryByTestId('cost-chip-pm')).not.toBeInTheDocument()
  })

  it('renders no chips without cost data (V1 default)', async () => {
    useRunsStore.setState({ runs: [{ id: 'r1', idea: 'x', stack: '', status: 'running' }], activeRunId: 'r1' })
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ run_id: 'r1', spent_usd: 5, estimated: false, budget: { max_usd: 10, percent_used: 0.5 }, budget_warning: false }),
    )
    renderCanvas()
    expect(await screen.findByText('Entry')).toBeInTheDocument()
    expect(screen.queryByTestId('cost-chip-developer')).not.toBeInTheDocument()
  })

  it('clique em filho display (appsec) abre o inspector do PAI (parallel_audit)', async () => {
    useCanvasStore.setState({ nodeStatus: { parallel_audit: { status: 'running', attemptCount: 0 } } })
    renderCanvas()
    fireEvent.click(await screen.findByLabelText('AppSec (Running)'))
    expect(useCanvasStore.getState().selectedNodeId).toBe('parallel_audit')
  })

  it('clique no split abre o inspector do PAI (parallel_audit)', async () => {
    useCanvasStore.setState({ nodeStatus: { parallel_audit: { status: 'running', attemptCount: 0 } } })
    renderCanvas()
    fireEvent.click(await screen.findByLabelText('Split (parallel audit)'))
    expect(useCanvasStore.getState().selectedNodeId).toBe('parallel_audit')
  })
})
