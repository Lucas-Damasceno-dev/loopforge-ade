import { render, screen, fireEvent } from '@testing-library/react'
import { ConsolePanel } from '../ConsolePanel'
import { useConsoleStore } from '../../../stores/consoleStore'

it('renders entries and filters by query', () => {
  useConsoleStore.setState({
    entries: [
      { id: '1', ts: 0, node: 'dev', level: 'info', message: 'hello world' },
      { id: '2', ts: 0, node: 'qa', level: 'error', message: 'boom' },
    ],
    filters: { node: 'all', level: 'all', query: '' },
    autoScroll: true,
  })
  render(<ConsolePanel />)
  expect(screen.getByText(/hello world/)).toBeInTheDocument()
  fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'boom' } })
  expect(screen.queryByText(/hello world/)).not.toBeInTheDocument()
  expect(screen.getByText(/boom/)).toBeInTheDocument()
})

it('filters by level select', () => {
  useConsoleStore.setState({ entries: [
    { id: '1', ts: 0, node: 'dev', level: 'info', message: 'info msg' },
    { id: '2', ts: 0, node: 'dev', level: 'error', message: 'err msg' },
  ], filters: { node: 'all', level: 'error', query: '' }, autoScroll: true })
  render(<ConsolePanel />)
  expect(screen.getByText(/err msg/)).toBeInTheDocument()
  expect(screen.queryByText(/info msg/)).not.toBeInTheDocument()
})
