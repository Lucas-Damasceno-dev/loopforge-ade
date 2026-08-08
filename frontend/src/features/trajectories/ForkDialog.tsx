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
// run_id + botão "Abrir", erro 404/409 com mensagem PT (role=alert).
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
      setError(trajectoryErrorMessage(e, 'Falha ao bifurcar a trajetória'))
    } finally {
      setLoading(false)
    }
  }

  const openRun = () => {
    if (result) onOpenRun(result)
    onClose()
  }

  return (
    <Modal open title="Fork da trajetória" onClose={onClose} maxWidth={440}>
      <div className="p-4">
        {result ? (
          <>
            <div
              role="status"
              className="mb-3 rounded-md border border-[var(--ok)]/30 bg-[var(--ok)]/15 px-3 py-2 text-sm text-[var(--ok-text)]"
            >
              Trajetória bifurcada com sucesso.
            </div>
            <p className="text-sm text-[var(--text-dim)]">
              Nova run:{' '}
              <span className="font-mono font-medium text-[var(--text)]" data-testid="fork-run-id">
                {shortId(result.fork_run_id)}
              </span>{' '}
              — criada a partir do checkpoint <span className="font-mono">{shortId(result.checkpoint_id)}</span>.
            </p>
            <p className="mt-1 font-mono text-xs text-[var(--text-dim)]">
              thread {result.thread_id} · status <Badge tone="info">na fila</Badge>
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={onClose}>
                Fechar
              </Button>
              <Button size="sm" variant="primary" onClick={openRun}>
                Abrir run
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-[var(--text)]">Fork da trajetória</h2>
            <p className="mt-1 text-sm text-[var(--text-dim)]">
              Bifurcar <span className="font-mono text-[var(--text)]">{shortId(run.id)}</span> copia os checkpoints
              atuais para uma run nova (na fila) — a run original não é alterada.
            </p>
            <label htmlFor="fork-description" className="mt-4 mb-1 block text-xs text-[var(--text-dim)]">
              Descrição (opcional)
            </label>
            <Input
              id="fork-description"
              aria-label="Descrição da nova run"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: continuar a partir do QA com nova direção"
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
                Cancelar
              </Button>
              <Button size="sm" variant="primary" onClick={submit} disabled={loading}>
                {loading ? 'Forkando…' : 'Fork'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
