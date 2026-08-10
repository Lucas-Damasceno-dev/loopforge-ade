import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TrajectoriesPanel } from '../TrajectoriesPanel'
import { useRunsStore } from '../../../stores/runsStore'
import { forkTrajectory, exportTrajectory, importTrajectory, getRunTimeline } from '../../../shared/lib/api'
import type { Run } from '../../../shared/lib/types'

// API mockada — os diálogos só exercitam o wire real da Fase C.
vi.mock('../../../shared/lib/api', () => ({
  forkTrajectory: vi.fn(),
  exportTrajectory: vi.fn(),
  importTrajectory: vi.fn(),
  getRunTimeline: vi.fn(),
  threadIdForRun: (id: string) => `run-${id}`,
}))

// jsdom não implementa object URLs nem a navegação do anchor de download
// (blob) — stub p/ o download do export (mesmo padrão do download.test.ts).
beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:mock')
  URL.revokeObjectURL = vi.fn()
})

const run: Run = { id: 'r1', idea: 'Página de login', stack: 'python', status: 'completed', thread_id: 'run-r1' }

beforeEach(() => {
  useRunsStore.setState({ runs: [run], activeRunId: null, queue: [], past: [], future: [] })
  vi.clearAllMocks()
  // Recriado a cada teste: vi.restoreAllMocks() do afterEach de outros mocks
  // restauraria o prototype caso fosse criado só no beforeAll.
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

function renderPanel() {
  return render(<TrajectoriesPanel open onClose={() => {}} />)
}

// Ações do painel: o botão da linha e o botão primário do diálogo têm o
// mesmo rótulo ("Fork"/"Export") — os testes de diálogo SEMPRE escopam a
// query com within(dialog) para não pegar o botão da linha.
async function openForkDialog() {
  await userEvent.click(screen.getByRole('button', { name: 'Fork' }))
  return screen.getByRole('dialog', { name: 'Fork trajectory' })
}

async function openExportDialog() {
  await userEvent.click(screen.getByRole('button', { name: 'Export' }))
  return screen.getByRole('dialog', { name: 'Export trajectory' })
}

describe('TrajectoriesPanel (Fase C)', () => {
  it('lists runs with Fork/Export/Timeline actions', () => {
    renderPanel()
    const row = screen.getByTestId('trajectory-row')
    expect(within(row).getByText('r1')).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Fork' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Export' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Timeline' })).toBeInTheDocument()
  })

  it('fork flow: POST fork → sucesso mostra a nova run e registra no store', async () => {
    vi.mocked(forkTrajectory).mockResolvedValue({ fork_run_id: 'f1', thread_id: 'run-f1', checkpoint_id: 'cp-9' })
    renderPanel()
    const dialog = await openForkDialog()
    expect(forkTrajectory).not.toHaveBeenCalled() // só dispara no confirm do modal
    await userEvent.click(within(dialog).getByRole('button', { name: /^fork$/i }))
    await waitFor(() => expect(forkTrajectory).toHaveBeenCalledWith('run-r1'))
    // Sucesso: mensagem EN + nova run na lista do store (queued).
    expect(screen.getByTestId('fork-run-id')).toHaveTextContent('f1')
    expect(useRunsStore.getState().runs.some((r) => r.id === 'f1' && r.status === 'queued' && r.thread_id === 'run-f1')).toBe(true)
  })

  it('fork 409 mostra erro PT e não registra run', async () => {
    vi.mocked(forkTrajectory).mockRejectedValue(
      Object.assign(new Error('x'), { status: 409, detail: 'Nenhum checkpoint copiável na thread de origem' }),
    )
    renderPanel()
    const dialog = await openForkDialog()
    await userEvent.click(within(dialog).getByRole('button', { name: /^fork$/i }))
    await waitFor(() => {
      expect(within(screen.getByRole('dialog', { name: 'Fork trajectory' })).getByRole('alert')).toHaveTextContent(
        'Nenhum checkpoint copiável na thread de origem',
      )
    })
    expect(useRunsStore.getState().runs).toHaveLength(1)
  })

  it('fork com descrição opcional → nova run herda a descrição como idea', async () => {
    vi.mocked(forkTrajectory).mockResolvedValue({ fork_run_id: 'f1', thread_id: 'run-f1', checkpoint_id: 'cp-9' })
    renderPanel()
    const dialog = await openForkDialog()
    await userEvent.type(screen.getByLabelText('New run description'), 'Continuar com outro stack')
    await userEvent.click(within(dialog).getByRole('button', { name: /^fork$/i }))
    await waitFor(() => {
      const f1 = useRunsStore.getState().runs.find((r) => r.id === 'f1')
      expect(f1?.idea).toBe('Continuar com outro stack')
    })
  })

  it('export flow: carrega JSON e oferece prévia + download', async () => {
    vi.mocked(exportTrajectory).mockResolvedValue({
      schema_version: '1.1',
      run_id: 'r1',
      thread_id: 'run-r1',
      checkpoints: [{ checkpoint_id: 'cp-1' }, { checkpoint_id: 'cp-2' }],
    } as never)
    renderPanel()
    const dialog = await openExportDialog()
    await userEvent.click(within(dialog).getByRole('button', { name: /^export$/i }))
    await waitFor(() => expect(exportTrajectory).toHaveBeenCalledWith('r1'))
    await waitFor(() => expect(within(dialog).getByText(/json preview/i)).toBeInTheDocument())
    expect(within(dialog).getByRole('button', { name: 'Download JSON' })).toBeInTheDocument()
    // Download dispara object URL (blob).
    await userEvent.click(within(dialog).getByRole('button', { name: 'Download JSON' }))
    expect(URL.createObjectURL).toHaveBeenCalled()
  })

  it('export 404 mostra erro PT', async () => {
    vi.mocked(exportTrajectory).mockRejectedValue(
      Object.assign(new Error('x'), { status: 404, detail: 'Run r1 não encontrada (sem trajetória)' }),
    )
    renderPanel()
    const dialog = await openExportDialog()
    await userEvent.click(within(dialog).getByRole('button', { name: /^export$/i }))
    await waitFor(() => {
      expect(within(screen.getByRole('dialog', { name: 'Export trajectory' })).getByRole('alert')).toHaveTextContent(
        'não encontrada',
      )
    })
  })

  it('import flow: file picker → POST /import → feedback EN + run registrada', async () => {
    vi.mocked(importTrajectory).mockResolvedValue({ run_id: 'r9', thread_id: 'run-r9', checkpoints_imported: 3 })
    renderPanel()
    const payload = JSON.stringify({ schema_version: '1.1', run_id: 'r9', thread_id: 'run-r9', idea: 'Importada do backup', checkpoints: [{}] })
    const file = new File([payload], 'traj.json', { type: 'application/json' })
    fireEvent.change(screen.getByTestId('import-file-input'), { target: { files: [file] } })
    await waitFor(() => expect(importTrajectory).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('trajectories-feedback')).toHaveTextContent('Trajectory imported — run r9 (3 checkpoints)')
    expect(useRunsStore.getState().runs.some((r) => r.id === 'r9' && r.status === 'queued')).toBe(true)
  })

  it('import 409 mostra erro PT do backend', async () => {
    vi.mocked(importTrajectory).mockRejectedValue(
      Object.assign(new Error('x'), { status: 409, detail: 'Thread já existe; sem merge no V1' }),
    )
    renderPanel()
    const file = new File([JSON.stringify({ schema_version: '1.1', run_id: 'r9', thread_id: 'run-r9', checkpoints: [] })], 'traj.json', { type: 'application/json' })
    fireEvent.change(screen.getByTestId('import-file-input'), { target: { files: [file] } })
    await waitFor(() => {
      const fb = screen.getByTestId('trajectories-feedback')
      expect(fb).toHaveTextContent('Thread já existe; sem merge no V1')
      expect(fb).toHaveAttribute('role', 'alert')
    })
  })

  it('import com JSON inválido mostra erro EN de arquivo', async () => {
    renderPanel()
    const file = new File(['{não é json'], 'traj.json', { type: 'application/json' })
    fireEvent.change(screen.getByTestId('import-file-input'), { target: { files: [file] } })
    await waitFor(() => expect(screen.getByTestId('trajectories-feedback')).toHaveTextContent('JSON expected'))
  })

  it('timeline flow: carrega página 1 e "load more" busca com after_seq', async () => {
    vi.mocked(getRunTimeline)
      .mockResolvedValueOnce({
        run_id: 'r1',
        timeline: [{ seq: 1, type: 'event', timestamp: 1700000000000, node: 'developer', data: { status: 'completed' } }],
        total_count: 2,
        has_more: true,
        next_after_seq: 1,
      } as never)
      .mockResolvedValueOnce({
        run_id: 'r1',
        timeline: [{ seq: 2, type: 'checkpoint', timestamp: '2026-08-08T10:00:00Z', node: 'qa', data: { checkpoint_id: 'cp-2' } }],
        total_count: 2,
        has_more: false,
        next_after_seq: null,
      } as never)
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Timeline' }))
    await waitFor(() => expect(getRunTimeline).toHaveBeenCalledWith('r1', 0, 50))
    const dialog = screen.getByRole('dialog', { name: 'Run timeline' })
    await waitFor(() => expect(within(dialog).getByTestId('timeline-entry')).toBeInTheDocument())
    // describeEvent infere do payload: {status} sem node → "Status: completed".
    expect(within(dialog).getByText('Status: completed')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: /load more/i }))
    await waitFor(() => expect(getRunTimeline).toHaveBeenCalledWith('r1', 1, 50))
    await waitFor(() => expect(within(dialog).getAllByTestId('timeline-entry')).toHaveLength(2))
  })
})
