import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReactFlow, ReactFlowProvider, type Node as FlowNode, type NodeProps } from '@xyflow/react'
import { SplitNode } from '../SplitNode'
import { useCanvasStore } from '../../../stores/canvasStore'
import type { DagNodeData } from '../dagModel'

// Handle exige contexto de nó real (NodeIdContext) — monta via ReactFlow
// (mesmo padrão do FlowCanvas.test: stubs de jsdom p/ o React Flow).
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', RO)

function wrap(ui: React.ReactElement) {
  return <ReactFlowProvider>{ui}</ReactFlowProvider>
}

function props(overrides: Partial<DagNodeData> = {}): NodeProps<FlowNode<DagNodeData, 'split'>> {
  return {
    data: {
      node: 'split',
      status: 'pending',
      attemptCount: 0,
      execIndex: 7,
      ghosted: false,
      display: 'audit',
      ...overrides,
    },
    selected: false,
  } as unknown as NodeProps<FlowNode<DagNodeData, 'split'>>
}

describe('SplitNode', () => {
  beforeEach(() => {
    useCanvasStore.setState({ selectedNodeId: null })
    vi.restoreAllMocks()
  })

  it('renderiza "Split" + badge "2× parallel"', () => {
    render(wrap(<SplitNode {...props()} />))
    expect(screen.getByText('Split')).toBeInTheDocument()
    expect(screen.getByText('2× parallel')).toBeInTheDocument()
  })

  it('badge pulsa (animate-pulse) quando running', () => {
    const { rerender } = render(wrap(<SplitNode {...props({ status: 'pending' })} />))
    expect(screen.getByText('2× parallel').className).not.toContain('animate-pulse')
    rerender(wrap(<SplitNode {...props({ status: 'running' })} />))
    expect(screen.getByText('2× parallel').className).toContain('animate-pulse')
  })

  it('ghosted → opacity-40 + aria-disabled, clique não seleciona', () => {
    const spy = vi.spyOn(useCanvasStore.getState(), 'selectNode').mockImplementation(() => {})
    render(wrap(<SplitNode {...props({ ghosted: true })} />))
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('opacity-40')
    expect(btn.getAttribute('aria-disabled')).toBe('true')
    expect(btn.tabIndex).toBe(-1)
    fireEvent.click(btn)
    expect(spy).not.toHaveBeenCalled()
  })

  it('clique seleciona o nó REAL (parallel_audit)', () => {
    const spy = vi.spyOn(useCanvasStore.getState(), 'selectNode').mockImplementation(() => {})
    render(wrap(<SplitNode {...props()} />))
    fireEvent.click(screen.getByRole('button'))
    expect(spy).toHaveBeenCalledWith('parallel_audit')
  })

  it('expõe 1 target + 2 source handles (ids a/b)', () => {
    render(
      <ReactFlow
        nodes={[{
          id: 'split',
          type: 'split',
          position: { x: 0, y: 0 },
          data: { node: 'split', status: 'pending', attemptCount: 0, execIndex: 7, ghosted: false, display: 'audit' },
        }]}
        nodeTypes={{ split: SplitNode }}
      />,
    )
    // React Flow v12.6: handle usa classes "source"/"target" (token), não
    // "react-flow__handle-source" — escopo no wrapper do nó.
    const nodeScope = document.querySelector('.react-flow__node')!
    const sources = nodeScope.querySelectorAll('[class~="source"]')
    const targets = nodeScope.querySelectorAll('[class~="target"]')
    expect(sources).toHaveLength(2)
    expect(targets).toHaveLength(1)
    const ids = [...sources].map((el) => el.getAttribute('data-handleid')).sort()
    expect(ids).toEqual(['a', 'b'])
  })
})
