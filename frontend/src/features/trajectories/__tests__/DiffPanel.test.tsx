import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DiffPanel } from '../DiffPanel'
import { getTrajectoryCheckpoints, getTrajectoryDiff } from '../../../shared/lib/trajectory'
import type { TrajectoryCheckpoint, TrajectoryDiff } from '../../../shared/lib/trajectory'
import type { Run } from '../../../shared/lib/types'

// Módulo novo (trajectory.ts) mockado — DiffPanel exercita o wire real.
vi.mock('../../../shared/lib/trajectory', () => ({
  getTrajectoryCheckpoints: vi.fn(),
  getTrajectoryDiff: vi.fn(),
}))

const run: Run = { id: 'r1', idea: 'Página de login', stack: 'python', status: 'completed' }

const checkpoints: TrajectoryCheckpoint[] = [
  { thread_id: 'run-r1', checkpoint_id: 'cp-1', parent_checkpoint_id: null, ts: '2026-08-05T00:00:00Z', step: 0, node: null },
  { thread_id: 'run-r1', checkpoint_id: 'cp-2', parent_checkpoint_id: 'cp-1', ts: '2026-08-05T00:00:01Z', step: 1, node: 'cpo' },
  { thread_id: 'run-r1', checkpoint_id: 'cp-3', parent_checkpoint_id: 'cp-2', ts: '2026-08-05T00:00:02Z', step: 2, node: 'pm' },
]

const diff: TrajectoryDiff = {
  thread_id: 'run-r1',
  from: 'cp-1',
  to: 'cp-3',
  added: { extra: '{"x": 1}' },
  removed: { drop: '"bye"' },
  changed: [{ key: 'next_agent', before: '"cpo"', after: '"pm"' }],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getTrajectoryCheckpoints).mockResolvedValue(checkpoints)
  vi.mocked(getTrajectoryDiff).mockResolvedValue(diff)
})

describe('DiffPanel (time-travel profundo)', () => {
  it('auto-compares primeiro vs último checkpoint e mostra added/removed/changed', async () => {
    render(<DiffPanel run={run} onClose={() => {}} />)
    // default: from = primeiro, to = último
    await waitFor(() => expect(getTrajectoryDiff).toHaveBeenCalledWith('run-r1', 'cp-1', 'cp-3'))

    const results = screen.getByTestId('diff-results')
    expect(within(results).getByTestId('diff-section-added')).toHaveTextContent('extra')
    expect(within(results).getByTestId('diff-section-added')).toHaveTextContent('{"x": 1}')
    expect(within(results).getByTestId('diff-section-removed')).toHaveTextContent('drop')
    expect(within(results).getByTestId('diff-section-changed')).toHaveTextContent('next_agent')
    expect(within(results).getByTestId('diff-section-changed')).toHaveTextContent('"cpo" → "pm"')
  })

  it('re-compares ao trocar o checkpoint From', async () => {
    const user = userEvent.setup()
    render(<DiffPanel run={run} onClose={() => {}} />)
    await waitFor(() => expect(getTrajectoryDiff).toHaveBeenCalledTimes(1))

    await user.selectOptions(screen.getByLabelText('From checkpoint'), 'cp-2')
    await waitFor(() => expect(getTrajectoryDiff).toHaveBeenCalledWith('run-r1', 'cp-2', 'cp-3'))
  })

  it('mostra EmptyState com <2 checkpoints e não chama o diff', async () => {
    vi.mocked(getTrajectoryCheckpoints).mockResolvedValue([checkpoints[0]])
    render(<DiffPanel run={run} onClose={() => {}} />)
    await screen.findByText('Not enough checkpoints')
    expect(screen.queryByTestId('diff-selectors')).not.toBeInTheDocument()
    expect(getTrajectoryDiff).not.toHaveBeenCalled()
  })

  it('mostra EmptyState sem checkpoints', async () => {
    vi.mocked(getTrajectoryCheckpoints).mockResolvedValue([])
    render(<DiffPanel run={run} onClose={() => {}} />)
    await screen.findByText('No checkpoints')
  })

  it('exibe erro inline quando o carregamento de checkpoints falha', async () => {
    vi.mocked(getTrajectoryCheckpoints).mockRejectedValue({ status: 404, detail: 'Run run-r1 não encontrada (sem trajetória)' })
    render(<DiffPanel run={run} onClose={() => {}} />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Run run-r1 não encontrada (sem trajetória)')
  })

  it('exibe erro inline quando o diff falha (mantém a seleção)', async () => {
    vi.mocked(getTrajectoryDiff).mockRejectedValue({ status: 404, detail: 'Checkpoint ghost não encontrado' })
    render(<DiffPanel run={run} onClose={() => {}} />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Checkpoint ghost não encontrado')
    expect(screen.getByTestId('diff-selectors')).toBeInTheDocument()
  })

  it('mostra "No state changes" quando o diff é vazio', async () => {
    vi.mocked(getTrajectoryDiff).mockResolvedValue({ thread_id: 'run-r1', from: 'cp-1', to: 'cp-3', added: {}, removed: {}, changed: [] })
    render(<DiffPanel run={run} onClose={() => {}} />)
    await screen.findByText('No state changes between these checkpoints.')
    expect(screen.queryByTestId('diff-section-added')).not.toBeInTheDocument()
  })
})
