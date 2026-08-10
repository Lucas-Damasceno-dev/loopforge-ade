import { useState } from 'react'
import { Modal } from '../../shared/ui/Modal'
import { Button } from '../../shared/ui/Button'
import { Input } from '../../shared/ui/Input'
import { Badge } from '../../shared/ui/Badge'
import { forkTrajectory, threadIdForRun } from '../../shared/lib/api'
import type { ForkResult, Run } from '../../shared/lib/types'
import { trajectoryErrorMessage } from './errorMsg'
import { shortId } from './shortId'

export interface ForkDialogProps {
  run: Run
  onClose: () => void
  /** Chamado no sucesso (para o painel registrar a nova run e dar feedback). */
  onForked: (result: ForkResult, description?: string) => void
  /** Chamado em "Abrir run" (painel seleciona a nova run no workspace). */
  onOpenRun: (result: ForkResult) => void
}

// Fork real (M-13): POST /trajectories/{thread_id}/fork copia os checkpoints
// da thread origem ('run-{id}') para uma thread nova 'run-{uuid}' — a run
// original não é alterada. Modal com loading no botão, sucesso com o novo
// run_id + botão "Open", erro 404/409 com detail do backend (role=alert).
export function ForkDialog({ run, onClose, onForked, onOpenRun }: ForkDialogProps) {
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ForkResult | null>(null)

  const submit = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await forkTrajectory(threadIdForRun(run.id))
      setResult(res)
      onForked(res, description.trim() || undefined)
    } catch (e) {
      setError(trajectoryErrorMessage(e, 'Failed to fork trajectory'))
    } finally {
      setLoading(false)
    }
  }

  const openRun = () => {
    if (result) onOpenRun(result)
    onClose()
  }

  return (
    <Modal open title="Fork trajectory" onClose={onClose} maxWidth={440}>
      <div className="p-4">
        {result ? (
          <>
            <div
              role="status"
              className="mb-3 rounded-md border border-[var(--ok)]/30 bg-[var(--ok)]/15 px-3 py-2 text-sm text-[var(--ok-text)]"
            >
              Trajectory forked successfully.
            </div>
            <p className="text-sm text-[var(--text-dim)]">
              New run:{' '}
              <span className="font-mono font-medium text-[var(--text)]" data-testid="fork-run-id">
                {shortId(result.fork_run_id)}
              </span>{' '}
              — created from checkpoint <span className="font-mono">{shortId(result.checkpoint_id)}</span>.
            </p>
            <p className="mt-1 font-mono text-xs text-[var(--text-dim)]">
              thread {result.thread_id} · status <Badge tone="info">queued</Badge>
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={onClose}>
                Close
              </Button>
              <Button size="sm" variant="primary" onClick={openRun}>
                Open run
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-[var(--text)]">Fork trajectory</h2>
            <p className="mt-1 text-sm text-[var(--text-dim)]">
              Forking <span className="font-mono text-[var(--text)]">{shortId(run.id)}</span> copies the current
              checkpoints to a new run (queued) — the original run is not changed.
            </p>
            <label htmlFor="fork-description" className="mt-4 mb-1 block text-xs text-[var(--text-dim)]">
              Description (optional)
            </label>
            <Input
              id="fork-description"
              aria-label="New run description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="E.g.: continue from QA with a new direction"
              disabled={loading}
            />
            {error && (
              <div
                role="alert"
                className="mt-3 rounded-md border border-[var(--err)]/30 bg-[var(--err)]/15 px-3 py-2 text-sm text-[var(--err-text)]"
              >
                {error}
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" onClick={submit} disabled={loading}>
                {loading ? 'Forking…' : 'Fork'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
