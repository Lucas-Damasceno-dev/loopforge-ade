import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RunsWorkspace } from '../RunsWorkspace'
import { useRunsStore } from '../../../stores/runsStore'
import { useCanvasStore } from '../../../stores/canvasStore'

// Stubs jsdom para o React Flow (só necessários se FlowCanvas renderizar).
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

const queryClient = new QueryClient()

function renderWorkspace() {
  return render(
    <QueryClientProvider client={queryClient}>
      <RunsWorkspace />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  useRunsStore.setState({ runs: [], activeRunId: null, queue: [], past: [], future: [] })
  useCanvasStore.setState({ nodeStatus: {}, ghostToStep: null })
})
afterEach(() => { vi.useRealTimers() })

describe('RunsWorkspace', () => {
  it('shows empty state and run demo creates a tab', () => {
    renderWorkspace()
    expect(screen.getByRole('button', { name: /run demo/i })).toBeInTheDocument()
    expect(screen.getByText('No active run')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /run demo/i }))
    // addRun é síncrono — a aba aparece sem avançar timers.
    expect(screen.getAllByRole('tab')).toHaveLength(1)
  })
})
