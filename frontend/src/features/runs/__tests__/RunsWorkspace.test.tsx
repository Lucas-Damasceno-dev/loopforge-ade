import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RunsWorkspace } from '../RunsWorkspace'
import { useRunsStore } from '../../../stores/runsStore'
import { useCanvasStore } from '../../../stores/canvasStore'
import { listRuns, createRun, resumeRun } from '../../../shared/lib/api'

vi.mock('../../../shared/lib/api', () => ({
  listRuns: vi.fn(),
  createRun: vi.fn(),
  resumeRun: vi.fn(),
  getRunQueue: vi.fn(),
}))

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
afterEach(() => {
  vi.useRealTimers()
  vi.mocked(listRuns).mockReset()
  vi.mocked(resumeRun).mockReset()
})

describe('RunsWorkspace', () => {
  it('shows empty state and run demo creates a tab', () => {
    vi.mocked(listRuns).mockResolvedValue({ items: [], total: 0 } as never)
    renderWorkspace()
    expect(screen.getByRole('button', { name: /run demo/i })).toBeInTheDocument()
    expect(screen.getByText('No active run')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /run demo/i }))
    // addRun é síncrono — a aba aparece sem avançar timers.
    expect(screen.getAllByRole('tab')).toHaveLength(1)
  })

  it('empty state: quick-start cards run example pipeline and focus the idea field', () => {
    vi.mocked(listRuns).mockResolvedValue({ items: [], total: 0 } as never)
    renderWorkspace()
    // "Create new run" foca o campo de ideia do NewRunForm (id fixo).
    fireEvent.click(screen.getByRole('button', { name: /create new run/i }))
    expect(screen.getByLabelText('Idea')).toHaveFocus()
    // "Run example pipeline" dispara a demo (addRun síncrono → aba nova).
    fireEvent.click(screen.getByRole('button', { name: /run example pipeline/i }))
    expect(screen.getAllByRole('tab')).toHaveLength(1)
  })

  it('boot: busca runs existentes e auto-seleciona a que está running', async () => {
    vi.useRealTimers() // boot usa promises reais (listRuns) — sem fake timers aqui
    vi.mocked(listRuns).mockResolvedValue({
      total: 3,
      items: [
        { id: 'r1', idea: 'feita', status: 'completed', stack: 'python', created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00' },
        { id: 'r2', idea: 'em execução', status: 'running', stack: 'python', created_at: '2026-01-01T00:00:01', updated_at: '2026-01-01T00:00:01' },
        { id: 'r3', idea: 'na fila', status: 'queued', stack: 'python', created_at: '2026-01-01T00:00:02', updated_at: '2026-01-01T00:00:02' },
      ],
    } as never)
    renderWorkspace()
    await waitFor(() => expect(listRuns).toHaveBeenCalled())
    // Todas as runs existentes viraram abas; a running foi auto-selecionada.
    expect(screen.getAllByRole('tab')).toHaveLength(3)
    expect(useRunsStore.getState().activeRunId).toBe('r2')
    expect(useRunsStore.getState().runs.map((r) => r.id)).toEqual(['r1', 'r2', 'r3'])
    expect(screen.queryByText('No active run')).not.toBeInTheDocument()
  })

  it('boot: sem runs ativas mantém empty state e não seleciona completed', async () => {
    vi.useRealTimers()
    vi.mocked(listRuns).mockResolvedValue({
      total: 1,
      items: [{ id: 'r9', idea: 'só concluída', status: 'completed', stack: 'python', created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00' }],
    } as never)
    renderWorkspace()
    await waitFor(() => expect(listRuns).toHaveBeenCalled())
    expect(useRunsStore.getState().activeRunId).toBeNull()
    expect(screen.getByText('No active run')).toBeInTheDocument()
  })

  it('boot: falha do listRuns não quebra o workspace (demo/sem backend)', async () => {
    vi.useRealTimers()
    vi.mocked(listRuns).mockRejectedValue(new Error('network'))
    renderWorkspace()
    await waitFor(() => expect(listRuns).toHaveBeenCalled())
    expect(screen.getByText('No active run')).toBeInTheDocument()
  })

  it('E3: criar 2ª run com a 1ª ativa seleciona a nova (abas paralelas)', async () => {
    vi.useRealTimers()
    vi.mocked(listRuns).mockResolvedValue({ items: [], total: 0 } as never)
    const mkRun = (id: string, idea: string) => ({
      id, idea, status: 'queued', stack: 'python',
      created_at: '2026-01-01T00:00:00', updated_at: '2026-01-01T00:00:00',
    })
    vi.mocked(createRun).mockResolvedValue(mkRun('r1', 'primeira') as never)

    renderWorkspace()
    const idea = screen.getByLabelText('Idea')
    fireEvent.change(idea, { target: { value: 'primeira' } })
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    // A nova run é selecionada na criação (foco de view; fila é do server).
    await waitFor(() => expect(useRunsStore.getState().activeRunId).toBe('r1'))

    // 2ª run com a 1ª ainda ativa → nova aba + nova selecionada.
    vi.mocked(createRun).mockResolvedValue(mkRun('r2', 'segunda') as never)
    fireEvent.change(idea, { target: { value: 'segunda' } })
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(useRunsStore.getState().activeRunId).toBe('r2'))

    expect(screen.getAllByRole('tab')).toHaveLength(2)
    expect(useRunsStore.getState().runs.map((r) => r.id)).toEqual(['r1', 'r2'])
  })

  it('mostra botão Resume na toolbar quando a run ativa está paused', () => {
    vi.mocked(listRuns).mockResolvedValue({ items: [], total: 0 } as never)
    useRunsStore.setState({
      runs: [{ id: 'r1', idea: 'x', stack: 'python', status: 'paused' }],
      activeRunId: 'r1',
      queue: [],
      past: [],
      future: [],
    })
    renderWorkspace()
    // Toolbar + banner renderizam Resume quando paused — confere presença.
    expect(screen.getAllByRole('button', { name: /^resume$/i }).length).toBeGreaterThan(0)
  })

  it('banner de paused oferece Resume e Budget override', () => {
    vi.mocked(listRuns).mockResolvedValue({ items: [], total: 0 } as never)
    useRunsStore.setState({
      runs: [{ id: 'r1', idea: 'x', stack: 'python', status: 'paused' }],
      activeRunId: 'r1',
      queue: [],
      past: [],
      future: [],
    })
    renderWorkspace()
    expect(screen.getByTestId('run-paused-banner')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /budget override/i })).toBeInTheDocument()
  })

  it('clique em Resume chama resumeRun e upserta a run', async () => {
    vi.useRealTimers() // boot + resumeRun usam promises reais — sem fake timers
    vi.mocked(listRuns).mockResolvedValue({ items: [], total: 0 } as never)
    useRunsStore.setState({
      runs: [{ id: 'r1', idea: 'x', stack: 'python', status: 'paused' }],
      activeRunId: 'r1',
      queue: [],
      past: [],
      future: [],
    })
    vi.mocked(resumeRun).mockResolvedValue({ id: 'r1', idea: 'x', stack: 'python', status: 'running' })
    renderWorkspace()
    // Toolbar e banner ambos expõem Resume — o primeiro dispara o mesmo fluxo.
    fireEvent.click(screen.getAllByRole('button', { name: /^resume$/i })[0])
    await waitFor(() => {
      expect(resumeRun).toHaveBeenCalledWith('r1')
      expect(useRunsStore.getState().runs[0].status).toBe('running')
    })
  })
})
