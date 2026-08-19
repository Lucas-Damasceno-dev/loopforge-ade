import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReactFlowProvider, type Node as FlowNode, type NodeProps } from '@xyflow/react'
import { AgentNode } from '../AgentNode'
import { useCanvasStore } from '../../../stores/canvasStore'
import { useConsoleStore } from '../../../stores/consoleStore'
import type { DagNodeData } from '../dagModel'

// Handle exige no mínimo o ReactFlowProvider (SplitNode.test: mesmo padrão).
function wrap(ui: React.ReactElement) {
  return <ReactFlowProvider>{ui}</ReactFlowProvider>
}

function props(
  node: DagNodeData['node'],
  overrides: Partial<DagNodeData> = {},
): NodeProps<FlowNode<DagNodeData, 'agent'>> {
  return {
    data: { node, status: 'pending', attemptCount: 0, execIndex: 0, ghosted: false, ...overrides },
    selected: false,
  } as unknown as NodeProps<FlowNode<DagNodeData, 'agent'>>
}

describe('AgentNode', () => {
  beforeEach(() => {
    useCanvasStore.setState({ selectedNodeId: null })
    useConsoleStore.setState({ streams: {} })
    vi.restoreAllMocks()
  })

  it('filho display (appsec) abre o inspector do PAI (parallel_audit)', () => {
    const spy = vi.spyOn(useCanvasStore.getState(), 'selectNode').mockImplementation(() => {})
    render(wrap(<AgentNode {...props('appsec', { status: 'running', execIndex: 7 })} />))
    fireEvent.click(screen.getByRole('button'))
    expect(spy).toHaveBeenCalledWith('parallel_audit')
  })

  it('filho display (devops) abre o inspector do PAI (parallel_audit)', () => {
    const spy = vi.spyOn(useCanvasStore.getState(), 'selectNode').mockImplementation(() => {})
    render(wrap(<AgentNode {...props('devops', { status: 'running', execIndex: 7 })} />))
    fireEvent.click(screen.getByRole('button'))
    expect(spy).toHaveBeenCalledWith('parallel_audit')
  })

  it('regressão: nó normal (developer) seleciona a si mesmo', () => {
    const spy = vi.spyOn(useCanvasStore.getState(), 'selectNode').mockImplementation(() => {})
    render(wrap(<AgentNode {...props('developer', { execIndex: 5 })} />))
    fireEvent.click(screen.getByRole('button'))
    expect(spy).toHaveBeenCalledWith('developer')
  })

  it('ghosted não seleciona (timeline)', () => {
    const spy = vi.spyOn(useCanvasStore.getState(), 'selectNode').mockImplementation(() => {})
    render(wrap(<AgentNode {...props('developer', { ghosted: true })} />))
    fireEvent.click(screen.getByRole('button'))
    expect(spy).not.toHaveBeenCalled()
  })

  it('exibe badge streaming quando há stream ativo no consoleStore (ADR-0007)', () => {
    useConsoleStore.setState({
      streams: { developer: { node: 'developer', content: 'generating...', ts: 0 } },
    })
    render(wrap(<AgentNode {...props('developer', { status: 'running' })} />))
    expect(screen.getByText(/streaming/i)).toBeInTheDocument()
  })
})
