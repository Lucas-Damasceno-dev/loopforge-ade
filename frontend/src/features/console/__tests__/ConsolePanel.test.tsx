import { vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ConsolePanel } from '../ConsolePanel'
import { useConsoleStore } from '../../../stores/consoleStore'

it('renders entries and filters by query', () => {
  useConsoleStore.setState({
    entries: [
      { id: '1', ts: 0, node: 'developer', level: 'info', message: 'hello world' },
      { id: '2', ts: 0, node: 'qa', level: 'error', message: 'boom' },
    ],
    streams: {},
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
    { id: '1', ts: 0, node: 'developer', level: 'info', message: 'info msg' },
    { id: '2', ts: 0, node: 'developer', level: 'error', message: 'err msg' },
  ], streams: {}, filters: { node: 'all', level: 'error', query: '' }, autoScroll: true })
  render(<ConsolePanel />)
  expect(screen.getByText(/err msg/)).toBeInTheDocument()
  expect(screen.queryByText(/info msg/)).not.toBeInTheDocument()
})

it('renders streaming token buffer with cursor (ADR-0007)', () => {
  useConsoleStore.setState({
    entries: [],
    streams: { developer: { node: 'developer', content: 'Ola mundo', runId: 'r1', ts: 0 } },
    filters: { node: 'all', level: 'all', query: '' },
    autoScroll: true,
  })
  render(<ConsolePanel />)
  const stream = screen.getByTestId('console-stream')
  expect(stream).toBeInTheDocument()
  expect(screen.getByText(/Ola mundo/)).toBeInTheDocument()
  expect(stream.querySelector('.console-stream-cursor')).toBeInTheDocument()
})

// ─── Colapso retrátil (auditoria P0.5) ────────────────────────────────────

it('collapses to a single row when empty (hint + chevron, filters hidden)', () => {
  useConsoleStore.setState({ entries: [], streams: {}, filters: { node: 'all', level: 'all', query: '' }, autoScroll: true })
  render(<ConsolePanel />)
  expect(screen.getByText('No logs')).toBeInTheDocument()
  expect(screen.getByLabelText('Expand console')).toBeInTheDocument()
  // Filtros/lista escondidos no colapso.
  expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument()
  expect(screen.queryByRole('list')).not.toBeInTheDocument()
})

it('expands manually from collapsed and shows the empty state', () => {
  useConsoleStore.setState({ entries: [], streams: {}, filters: { node: 'all', level: 'all', query: '' }, autoScroll: true })
  render(<ConsolePanel />)
  fireEvent.click(screen.getByLabelText('Expand console'))
  expect(screen.getByText('No console output yet')).toBeInTheDocument()
  expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument()
})

it('auto-expands when the first log arrives', () => {
  useConsoleStore.setState({ entries: [], streams: {}, filters: { node: 'all', level: 'all', query: '' }, autoScroll: true })
  render(<ConsolePanel />)
  expect(screen.getByText('No logs')).toBeInTheDocument()
  act(() => {
    useConsoleStore.setState({
      entries: [{ id: '1', ts: 0, node: 'developer', level: 'info', message: 'first log' }],
    })
  })
  expect(screen.getByText(/first log/)).toBeInTheDocument()
  expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument()
})

it('collapses and re-expands manually with content', () => {
  useConsoleStore.setState({
    entries: [
      { id: '1', ts: 0, node: 'developer', level: 'info', message: 'alpha' },
      { id: '2', ts: 0, node: 'qa', level: 'error', message: 'beta' },
    ],
    streams: {},
    filters: { node: 'all', level: 'all', query: '' },
    autoScroll: true,
  })
  render(<ConsolePanel />)
  expect(screen.getByText(/alpha/)).toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('Collapse console'))
  // Colapsado: hint com contagem, logs escondidos.
  expect(screen.getByText('2 logs')).toBeInTheDocument()
  expect(screen.queryByText(/alpha/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('Expand console'))
  expect(screen.getByText(/alpha/)).toBeInTheDocument()
})

// ─── Regressão T7 F1: auto-expand na transição vazio→cheio ────────────────

const baseState = () => ({
  entries: [] as never[],
  streams: {} as Record<string, never>,
  filters: { node: 'all' as const, level: 'all' as const, query: '' },
  autoScroll: true,
})

afterEach(() => {
  localStorage.removeItem('lf_console_collapsed')
})

it('auto-expands when content arrives even with saved=true (T7 F1 regression)', () => {
  // Preferência manual de colapsar salva (saved=true) + console vazio.
  localStorage.setItem('lf_console_collapsed', 'true')
  useConsoleStore.setState({ ...baseState(), collapsed: true })
  render(<ConsolePanel />)
  expect(screen.getByText('No logs')).toBeInTheDocument()
  // Novo log chega → transição vazio→cheio DEVE expandir (antes da T7
  // expandia sempre; T7 quebrou ao aplicar saved no efeito derivado).
  act(() => {
    useConsoleStore.setState({
      entries: [{ id: '1', ts: 0, node: 'developer', level: 'info', message: 'fresh log' }],
    })
  })
  expect(screen.getByText(/fresh log/)).toBeInTheDocument()
  expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument()
})

it('stays collapsed after manual collapse while content persists (preference respected)', () => {
  useConsoleStore.setState({
    ...baseState(),
    entries: [{ id: '1', ts: 0, node: 'developer', level: 'info', message: 'alpha' }],
    collapsed: false,
  })
  render(<ConsolePanel />)
  expect(screen.getByText(/alpha/)).toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('Collapse console'))
  expect(screen.getByText('1 log')).toBeInTheDocument()
  // Mudança que NÃO altera hasContent (filters) → derivação não re-roda →
  // preferência manual respeitada.
  act(() => {
    useConsoleStore.setState({ filters: { node: 'all', level: 'all', query: 'x' } })
  })
  expect(screen.getByText('1 log')).toBeInTheDocument()
  expect(screen.queryByText(/alpha/)).not.toBeInTheDocument()
})

// ─── Tab bar ícone-only (T6) ───────────────────────────────────────────────

it('renderiza tab bar ícone-only: Console ativo + badge de erros + Terminal', () => {
  useConsoleStore.setState({
    entries: [
      { id: '1', ts: 0, node: 'developer', level: 'info', message: 'ok' },
      { id: '2', ts: 0, node: 'qa', level: 'error', message: 'boom' },
    ],
    streams: {},
    filters: { node: 'all', level: 'all', query: '' },
    autoScroll: true,
  })
  render(<ConsolePanel />)
  const consoleTab = screen.getByRole('button', { name: 'Console' })
  expect(consoleTab).toHaveAttribute('aria-pressed', 'true')
  // Badge de count de erros (1 error → '1') no tab Console.
  expect(consoleTab.textContent).toContain('1')
  expect(screen.getByRole('button', { name: 'Terminal' })).toBeInTheDocument()
})

it('clique na tab Terminal chama onOpenTerminal', () => {
  const onOpenTerminal = vi.fn()
  render(<ConsolePanel onOpenTerminal={onOpenTerminal} />)
  fireEvent.click(screen.getByRole('button', { name: 'Terminal' }))
  expect(onOpenTerminal).toHaveBeenCalledTimes(1)
})
