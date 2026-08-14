import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReactFlow, ReactFlowProvider, type Node as FlowNode, type NodeProps } from '@xyflow/react'
import { MergeNode } from '../MergeNode'
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

function props(overrides: Partial<DagNodeData> = {}): NodeProps<FlowNode<DagNodeData, 'merge'>> {
  return {
    data: {
      node: 'merge',
      status: 'pending',
      attemptCount: 0,
      execIndex: 7,
      ghosted: false,
      ...overrides,
    },
    selected: false,
  } as unknown as NodeProps<FlowNode<DagNodeData, 'merge'>>
}

describe('MergeNode', () => {
  beforeEach(() => {
    useCanvasStore.setState({ selectedNodeId: null })
    vi.restoreAllMocks()
  })

  it('renderiza "Merge"', () => {
    render(wrap(<MergeNode {...props()} />))
    expect(screen.getByText('Merge')).toBeInTheDocument()
  })

  it('aria-label inclui status (F2 a11y)', () => {
    render(wrap(<MergeNode {...props({ status: 'approved' })} />))
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe('Merge (parallel audit, Approved)')
  })

  it('clique seleciona o nó REAL (parallel_audit)', () => {
    const spy = vi.spyOn(useCanvasStore.getState(), 'selectNode').mockImplementation(() => {})
    render(wrap(<MergeNode {...props()} />))
    fireEvent.click(screen.getByRole('button'))
    expect(spy).toHaveBeenCalledWith('parallel_audit')
  })

  it('ghosted → opacity-40 + aria-disabled, clique não seleciona', () => {
    const spy = vi.spyOn(useCanvasStore.getState(), 'selectNode').mockImplementation(() => {})
    render(wrap(<MergeNode {...props({ ghosted: true })} />))
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('opacity-40')
    expect(btn.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(btn)
    expect(spy).not.toHaveBeenCalled()
  })

  it('expõe 2 target handles (ids a/b) + 1 source', () => {
    render(
      <ReactFlow
        nodes={[{
          id: 'merge',
          type: 'merge',
          position: { x: 0, y: 0 },
          data: { node: 'merge', status: 'pending', attemptCount: 0, execIndex: 7, ghosted: false },
        }]}
        nodeTypes={{ merge: MergeNode }}
      />,
    )
    // React Flow v12.6: handle usa classes "source"/"target" (token), não
    // "react-flow__handle-source" — escopo no wrapper do nó.
    const nodeScope = document.querySelector('.react-flow__node')!
    const targets = nodeScope.querySelectorAll('[class~="target"]')
    const sources = nodeScope.querySelectorAll('[class~="source"]')
    expect(targets).toHaveLength(2)
    expect(sources).toHaveLength(1)
    const ids = [...targets].map((el) => el.getAttribute('data-handleid')).sort()
    expect(ids).toEqual(['a', 'b'])
  })
})
