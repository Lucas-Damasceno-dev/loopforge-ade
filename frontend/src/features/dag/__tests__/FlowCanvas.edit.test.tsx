import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FlowCanvas } from '../FlowCanvas'
import { useCanvasStore } from '../../../stores/canvasStore'
import { useEditorStore } from '../../pipelines/editorStore'
import { useRunsStore } from '../../../stores/runsStore'
import { useAgentsStore } from '../../../stores/agentsStore'

// Mesmo harness do FlowCanvas.test existente: stubs de jsdom p/ o React Flow.
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
const mockDOMRect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) }
const domMatrix = new (class DOMMatrixReadOnly2D {
  m22 = 1
  constructor(_init?: unknown) {}
  static fromMatrix = (m: unknown) => m
  static fromString = () => new DOMMatrixReadOnly2D()
  invert = () => new DOMMatrixReadOnly2D()
  multiply = () => new DOMMatrixReadOnly2D()
  translate = () => new DOMMatrixReadOnly2D()
  scale = () => new DOMMatrixReadOnly2D()
})()

function renderCanvas() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <FlowCanvas />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', RO)
  vi.stubGlobal('DOMRect', vi.fn(() => mockDOMRect))
  vi.stubGlobal('DOMMatrixReadOnly', domMatrix.constructor)
  vi.stubGlobal('Element', Element)
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(mockDOMRect as DOMRect)
  useCanvasStore.setState({ mode: 'graph', nodeStatus: {}, ghostToStep: null, selectedNodeId: null })
  useRunsStore.setState({ runs: [], activeRunId: null })
  useEditorStore.setState({ open: false, editingId: null, draft: null, live: true, selectedEdgeId: null, positions: {} })
  useAgentsStore.setState({ agents: [], loading: false, error: null })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('FlowCanvas modo edição (S3)', () => {
  it('edit mode renderiza os nós do draft (input/output/gate via AgentNode)', async () => {
    useEditorStore.setState({
      open: true,
      live: false,
      draft: {
        name: 'x',
        description: '',
        nodes: [
          { id: 'in', type: 'input', agent_id: null, config: {} },
          { id: 'dev', type: 'agent', agent_id: null, config: {} },
        ],
        edges: [],
      },
    })
    renderCanvas()
    expect(await screen.findByLabelText('Input (Pending)')).toBeInTheDocument()
    expect(screen.getByLabelText('Agent (Pending)')).toBeInTheDocument()
  })

  it('edit mode mostra a NodePalette e clique adiciona nó ao draft', async () => {
    useEditorStore.setState({
      open: true,
      live: false,
      draft: { name: 'x', description: '', nodes: [], edges: [] },
    })
    renderCanvas()
    expect(await screen.findByText('Input')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Split'))
    expect(useEditorStore.getState().draft!.nodes).toHaveLength(1)
    expect(useEditorStore.getState().draft!.nodes[0].type).toBe('split')
    // Nó split renderiza com SplitNode (aria-label próprio com status).
    await waitFor(() => expect(screen.getByLabelText('Split (parallel audit, Pending)')).toBeInTheDocument())
  })

  it('live mode NÃO mostra a paleta (comportamento 1:1)', async () => {
    useEditorStore.setState({ open: false, live: true, draft: null })
    renderCanvas()
    // 'Input' só existe na paleta do editor; live renderiza o DAG de execução.
    expect(screen.queryByText('Input')).not.toBeInTheDocument()
  })

  it('edit mode: labels dos nós agent = nome do agente da biblioteca (F1)', async () => {
    useAgentsStore.setState({
      agents: [
        { id: 'a1', name: 'Alpha', description: '', prompt: '', model: 'default', temperature: 0.7, max_retries: 2, timeout_seconds: 300, env_vars: {}, tools_allowlist: [], permissions: [], stack: 'python', budget_usd: 10, created_at: '', updated_at: '' },
        { id: 'a2', name: 'Beta', description: '', prompt: '', model: 'default', temperature: 0.7, max_retries: 2, timeout_seconds: 300, env_vars: {}, tools_allowlist: [], permissions: [], stack: 'python', budget_usd: 10, created_at: '', updated_at: '' },
      ],
      loading: false,
      error: null,
    })
    useEditorStore.setState({
      open: true,
      live: false,
      draft: {
        name: 'x',
        description: '',
        nodes: [
          { id: 'dev', type: 'agent', agent_id: 'a1', config: {} },
          { id: 'sec', type: 'agent', agent_id: 'a2', config: {} },
          // agente órfão (deleted template) → fallback 'Agent' sem crash.
          { id: 'ghost', type: 'agent', agent_id: 'gone', config: {} },
        ],
        edges: [],
      },
    })
    renderCanvas()
    expect(await screen.findByLabelText('Alpha (Pending)')).toBeInTheDocument()
    expect(screen.getByLabelText('Beta (Pending)')).toBeInTheDocument()
    expect(screen.getByLabelText('Agent (Pending)')).toBeInTheDocument()
  })
})
