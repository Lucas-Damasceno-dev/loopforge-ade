import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FlowCanvas } from '../FlowCanvas'
import { useCanvasStore } from '../../../stores/canvasStore'

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

beforeEach(() => {
  useCanvasStore.setState({ mode: 'kanban', nodeStatus: {}, ghostToStep: null, selectedNodeId: null })
})

describe('FlowCanvas', () => {
  it('renders agent nodes with labels', () => {
    useCanvasStore.setState({ mode: 'kanban', nodeStatus: {} })
    render(<FlowCanvas />)
    expect(screen.getByText('Entry')).toBeInTheDocument()
    expect(screen.getByText('CPO')).toBeInTheDocument()
  })
})
