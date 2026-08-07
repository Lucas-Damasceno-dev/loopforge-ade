import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HitlDrawer } from '../HitlDrawer'
import { useCanvasStore } from '../../../stores/canvasStore'
import { useRunsStore } from '../../../stores/runsStore'
import { useConsoleStore } from '../../../stores/consoleStore'
import { decideRun } from '../../../shared/lib/api'
import type { Run } from '../../../shared/lib/types'

vi.mock('../../../shared/lib/api', () => ({ decideRun: vi.fn(), getDecisions: vi.fn().mockResolvedValue([]) }))

// RunStatus não inclui 'paused' (o estado paused mora no canvasStore) — o
// status da run no teste é irrelevante p/ o drawer; cast mantém o valor do brief.
const pausedRun = { id: 'r1', idea: 'x', stack: '', status: 'paused' } as unknown as Run
const runningRun = { id: 'r1', idea: 'x', stack: '', status: 'running' } as Run

it('opens when a node is paused and shows actions', async () => {
  useCanvasStore.setState({ nodeStatus: { qa: { status: 'paused', attemptCount: 1 } } })
  useRunsStore.setState({ runs: [pausedRun], activeRunId: 'r1' })
  render(<HitlDrawer />)
  expect(screen.getByText(/Waiting for decision/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /approve/i }))
  expect(decideRun).toHaveBeenCalledWith('r1', expect.objectContaining({ action: 'approve' }))
})
it('does not render without paused node', () => {
  useCanvasStore.setState({ nodeStatus: { qa: { status: 'approved', attemptCount: 1 } } })
  useRunsStore.setState({ runs: [runningRun], activeRunId: 'r1' })
  const { container } = render(<HitlDrawer />)
  expect(container).toBeEmptyDOMElement()
})
it('shows expired timeout banner', () => {
  useCanvasStore.setState({ nodeStatus: { qa: { status: 'paused', attemptCount: 1 } } })
  useRunsStore.setState({ runs: [pausedRun], activeRunId: 'r1' })
  useConsoleStore.setState({ entries: [{ id: '1', ts: 0, node: 'qa', level: 'warn', message: 'HITL decision expired (300s)' }], filters: { node: 'all', level: 'all', query: '' }, autoScroll: true })
  render(<HitlDrawer />)
  expect(screen.getByText(/decision expired/i)).toBeInTheDocument()
})
