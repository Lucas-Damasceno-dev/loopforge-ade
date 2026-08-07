import { render, screen } from '@testing-library/react'
import { InspectDrawer } from '../InspectDrawer'
import { useCanvasStore } from '../../../stores/canvasStore'
import { useConsoleStore } from '../../../stores/consoleStore'

it('opens with node info and retry badge', () => {
  useCanvasStore.setState({ selectedNodeId: 'dev', nodeStatus: { dev: { status: 'approved', attemptCount: 3 } } })
  render(<InspectDrawer />)
  expect(screen.getByText('Dev')).toBeInTheDocument()
  expect(screen.getByText('×3')).toBeInTheDocument()
})
it('shows node-scoped console logs', () => {
  useCanvasStore.setState({ selectedNodeId: 'dev' })
  useConsoleStore.setState({ entries: [
    { id: '1', ts: 0, node: 'dev', level: 'info', message: 'dev log' },
    { id: '2', ts: 0, node: 'qa', level: 'info', message: 'qa log' },
  ], filters: { node: 'all', level: 'all', query: '' }, autoScroll: true })
  render(<InspectDrawer />)
  expect(screen.getByText(/dev log/)).toBeInTheDocument()
  expect(screen.queryByText(/qa log/)).not.toBeInTheDocument()
})
it('parallel audit is collapsible', () => {
  useCanvasStore.setState({ selectedNodeId: 'parallel_audit' })
  render(<InspectDrawer />)
  expect(screen.getByText('AppSec')).toBeInTheDocument()
  expect(screen.getByText('DevOps')).toBeInTheDocument()
})
