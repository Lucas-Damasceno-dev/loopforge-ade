import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HitlDrawer } from '../HitlDrawer'
import { useCanvasStore } from '../../../stores/canvasStore'
import { useRunsStore } from '../../../stores/runsStore'
import { useConsoleStore } from '../../../stores/consoleStore'
import { decideRun } from '../../../shared/lib/api'
import type { Run } from '../../../shared/lib/types'

vi.mock('../../../shared/lib/api', () => ({
  decideRun: vi.fn(),
  getDecisions: vi.fn().mockResolvedValue([]),
  getCheckpoints: vi.fn().mockResolvedValue([]),
  getCheckpoint: vi.fn(),
  // A2: drawer recarrega o estado real da run após a decisão (best-effort).
  getRun: vi.fn().mockResolvedValue({ id: 'r1', idea: 'x', stack: '', status: 'running' }),
}))

// Reset dos stores + mocks entre testes (os `not.toHaveBeenCalled()` de
// adjust_state dependem de chamadas acumuladas do decideRun zeradas).
beforeEach(() => {
  vi.clearAllMocks()
  useCanvasStore.setState({ nodeStatus: {}, ghostToStep: null })
  useRunsStore.setState({ runs: [], activeRunId: null, queue: [], past: [], future: [] })
  useConsoleStore.setState({ entries: [], filters: { node: 'all', level: 'all', query: '' }, autoScroll: true })
})

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
  // Wire real: action 'approve' + gate_node.
  expect(decideRun).toHaveBeenCalledWith('r1', expect.objectContaining({ action: 'approve', gate_node: 'qa' }))
})
it('does not render without paused node', async () => {
  useCanvasStore.setState({ nodeStatus: { qa: { status: 'approved', attemptCount: 1 } } })
  useRunsStore.setState({ runs: [runningRun], activeRunId: 'r1' })
  const { container } = render(<HitlDrawer />)
  // Drena as promises do getDecisions (setState assíncrono) antes de assertar.
  await waitFor(() => expect(container).toBeEmptyDOMElement())
})
it('shows expired timeout banner', async () => {
  useCanvasStore.setState({ nodeStatus: { qa: { status: 'paused', attemptCount: 1 } } })
  useRunsStore.setState({ runs: [pausedRun], activeRunId: 'r1' })
  useConsoleStore.setState({ entries: [{ id: '1', ts: 0, node: 'qa', level: 'warn', message: 'HITL decision expired (300s)' }], filters: { node: 'all', level: 'all', query: '' }, autoScroll: true })
  render(<HitlDrawer />)
  expect(await screen.findByText(/decision expired/i)).toBeInTheDocument()
})
it('renders doom-loop guard alert when run or console indicates doom loop', async () => {
  useCanvasStore.setState({ nodeStatus: { qa: { status: 'paused', attemptCount: 2 } } })
  useRunsStore.setState({ runs: [{ ...pausedRun, degraded_reason: 'doom_loop_detected' } as Run], activeRunId: 'r1' })
  render(<HitlDrawer />)
  expect(await screen.findByTitle(/doom-loop guard ativo/i)).toBeInTheDocument()
})
it('adjust state (C3) sends adjust_state with state_patch from guided fields', async () => {
  useCanvasStore.setState({ nodeStatus: { qa: { status: 'paused', attemptCount: 1 } } })
  useRunsStore.setState({ runs: [pausedRun], activeRunId: 'r1' })
  render(<HitlDrawer />)
  await userEvent.click(screen.getByRole('button', { name: /adjust state/i }))
  // Form guiado: canais reais do GraphState → state_patch.
  await userEvent.type(screen.getByLabelText('Idea'), 'Nova direção')
  await userEvent.selectOptions(screen.getByLabelText('Routing mode'), 'fast')
  await userEvent.click(screen.getByRole('button', { name: /apply/i }))
  expect(decideRun).toHaveBeenCalledWith(
    'r1',
    expect.objectContaining({
      action: 'adjust_state',
      gate_node: 'qa',
      state_patch: { idea: 'Nova direção', routing_mode: 'fast' },
    }),
  )
})
it('adjust state advanced JSON validates and shows error on invalid syntax', async () => {
  useCanvasStore.setState({ nodeStatus: { qa: { status: 'paused', attemptCount: 1 } } })
  useRunsStore.setState({ runs: [pausedRun], activeRunId: 'r1' })
  render(<HitlDrawer />)
  await userEvent.click(screen.getByRole('button', { name: /adjust state/i }))
  await userEvent.click(screen.getByRole('switch', { name: 'Advanced JSON' }))
  fireEvent.change(screen.getByLabelText('State JSON'), { target: { value: '{invalid' } })
  expect(screen.getByRole('alert')).toHaveTextContent('Invalid JSON')
  // Estado inválido bloqueia o Apply (o alert continua, nada é enviado).
  await userEvent.click(screen.getByRole('button', { name: /apply/i }))
  expect(decideRun).not.toHaveBeenCalled()
})
it('adjust state with no edited fields shows error before sending', async () => {
  useCanvasStore.setState({ nodeStatus: { qa: { status: 'paused', attemptCount: 1 } } })
  useRunsStore.setState({ runs: [pausedRun], activeRunId: 'r1' })
  render(<HitlDrawer />)
  await userEvent.click(screen.getByRole('button', { name: /adjust state/i }))
  await userEvent.click(screen.getByRole('button', { name: /apply/i }))
  expect(screen.getByRole('alert')).toHaveTextContent('No fields changed')
  expect(decideRun).not.toHaveBeenCalled()
})
it('abort requires destructive confirmation before sending', async () => {
  useCanvasStore.setState({ nodeStatus: { qa: { status: 'paused', attemptCount: 1 } } })
  useRunsStore.setState({ runs: [pausedRun], activeRunId: 'r1' })
  render(<HitlDrawer />)
  await userEvent.click(screen.getByRole('button', { name: /abort/i }))
  // Confirmação destrutiva (01b §3.13): a ação só dispara no modal danger.
  const dialog = screen.getByRole('dialog', { name: 'Abort run?' })
  expect(dialog).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: /^abort$/i }))
  expect(decideRun).toHaveBeenCalledWith('r1', expect.objectContaining({ action: 'abort', gate_node: 'qa' }))
})
it('enviar feedback (categoria + mensagem) no payload do decideRun (item 3)', async () => {
  useCanvasStore.setState({ nodeStatus: { qa: { status: 'paused', attemptCount: 1 } } })
  useRunsStore.setState({ runs: [pausedRun], activeRunId: 'r1' })
  render(<HitlDrawer />)
  await userEvent.selectOptions(screen.getByLabelText('Categoria do feedback'), 'bug')
  await userEvent.type(screen.getByLabelText('Mensagem de feedback (opcional)'), 'O código quebrou no caso de borda X')
  await userEvent.click(screen.getByRole('button', { name: /approve/i }))
  expect(decideRun).toHaveBeenCalledWith(
    'r1',
    expect.objectContaining({
      action: 'approve',
      gate_node: 'qa',
      feedback_category: 'bug',
      feedback_message: 'O código quebrou no caso de borda X',
    }),
  )
})
it('sem feedback preenchido, envia categoria default general (item 3)', async () => {
  useCanvasStore.setState({ nodeStatus: { qa: { status: 'paused', attemptCount: 1 } } })
  useRunsStore.setState({ runs: [pausedRun], activeRunId: 'r1' })
  render(<HitlDrawer />)
  await userEvent.click(screen.getByRole('button', { name: /approve/i }))
  expect(decideRun).toHaveBeenCalledWith('r1', expect.objectContaining({ action: 'approve', gate_node: 'qa', feedback_category: 'general' }))
  // Mensagem vazia → campo ausente do payload.
  expect(decideRun).not.toHaveBeenCalledWith('r1', expect.objectContaining({ feedback_message: '' }))
})
