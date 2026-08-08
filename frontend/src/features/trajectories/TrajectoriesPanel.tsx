import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Drawer } from '../../shared/ui/Drawer'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import type { BadgeProps } from '../../shared/ui/Badge'
import { EmptyState } from '../../shared/ui/EmptyState'
import { useRunsStore } from '../../stores/runsStore'
import { importTrajectory } from '../../shared/lib/api'
import type { ForkResult, ImportResult, Run, RunStatus, TrajectoryExport } from '../../shared/lib/types'
import { trajectoryErrorMessage } from './errorMsg'
import { shortId } from './shortId'
import { ForkDialog } from './ForkDialog'
import { ExportDialog } from './ExportDialog'
import { TimelineDialog } from './TimelineDialog'

// status da run → tone do badge (mesmo mapeamento do RunTabs).
const STATUS_TONE: Record<RunStatus, BadgeProps['tone']> = {
  pending: 'neutral',
  queued: 'info',
  running: 'accent',
  paused: 'warn',
  completed: 'ok',
  failed: 'err',
}

function statusLabel(s: RunStatus): string {
  if (s === 'queued') return 'Na fila'
  if (s === 'paused') return 'Pausada'
  return s
}

export interface TrajectoriesPanelProps {
  open: boolean
  onClose: () => void
}

// Tela de trajetórias (Fase C): drawer listando as runs com ações por linha —
// Fork (M-13), Exportar (M-14), Timeline (C5) — e Importar no topo (M-14).
// Sucesso/erro das operações em PT-BR inline. Fork/import registram a nova
// run no runsStore (status queued) — ela aparece como aba no workspace.
export function TrajectoriesPanel({ open, onClose }: TrajectoriesPanelProps) {
  const runs = useRunsStore((s) => s.runs)
  const [forkRun, setForkRun] = useState<Run | null>(null)
  const [exportRun, setExportRun] = useState<Run | null>(null)
  const [timelineRun, setTimelineRun] = useState<Run | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleForked = (result: ForkResult, description?: string) => {
    const source = runs.find((r) => r.id === result.fork_run_id) ?? forkRun
    useRunsStore.getState().upsertRun({
      id: result.fork_run_id,
      idea: description ?? source?.idea ?? '',
      stack: source?.stack ?? '',
      status: 'queued',
      thread_id: result.thread_id,
    })
    setFeedback({ tone: 'ok', text: `Fork criado — nova run ${shortId(result.fork_run_id)}` })
  }

  const openForkedRun = (result: ForkResult) => {
    useRunsStore.getState().selectRun(result.fork_run_id)
  }

  const handleImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // permite reimportar o mesmo arquivo
    if (!file) return
    setImporting(true)
    setFeedback(null)
    try {
      const text = await file.text()
      const payload = JSON.parse(text) as TrajectoryExport
      const res: ImportResult = await importTrajectory(payload)
      useRunsStore.getState().upsertRun({
        id: res.run_id,
        idea: typeof payload.idea === 'string' && payload.idea.length > 0 ? payload.idea : 'Importada',
        stack: 'python',
        status: 'queued',
        thread_id: res.thread_id,
      })
      setFeedback({ tone: 'ok', text: `Trajetória importada — run ${shortId(res.run_id)} (${res.checkpoints_imported} checkpoints)` })
    } catch (err) {
      const message = err instanceof SyntaxError ? 'Arquivo inválido — JSON esperado' : trajectoryErrorMessage(err, 'Falha ao importar a trajetória')
      setFeedback({ tone: 'err', text: message })
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      <Drawer open={open} title="Trajetórias" onClose={onClose}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-xs text-[var(--text-dim)]">
            {runs.length} {runs.length === 1 ? 'run' : 'runs'}
          </span>
          <Button size="sm" variant="primary" disabled={importing} onClick={() => fileRef.current?.click()}>
            {importing ? 'Importando…' : 'Importar'}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            data-testid="import-file-input"
            onChange={handleImportFile}
          />
        </div>

        {feedback && (
          <div
            role={feedback.tone === 'ok' ? 'status' : 'alert'}
            data-testid="trajectories-feedback"
            className={`mb-3 rounded-md border px-3 py-2 text-sm ${
              feedback.tone === 'ok'
                ? 'border-[var(--ok)]/30 bg-[var(--ok)]/15 text-[var(--ok-text)]'
                : 'border-[var(--err)]/30 bg-[var(--err)]/15 text-[var(--err-text)]'
            }`}
          >
            {feedback.text}
          </div>
        )}

        {runs.length === 0 ? (
          <EmptyState
            title="Nenhuma run ainda"
            description="Rode uma run ou importe um JSON de trajetória para começar."
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {runs.map((run) => (
              <li key={run.id} className="flex items-start gap-2 py-2.5" data-testid="trajectory-row">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-medium text-[var(--text)]">{shortId(run.id)}</span>
                    <Badge tone={STATUS_TONE[run.status]}>{statusLabel(run.status)}</Badge>
                  </div>
                  {run.idea ? (
                    <p className="mt-0.5 truncate text-xs text-[var(--text-dim)]" title={run.idea}>
                      {run.idea}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  <Button size="sm" variant="subtle" onClick={() => setForkRun(run)}>
                    Fork
                  </Button>
                  <Button size="sm" variant="subtle" onClick={() => setExportRun(run)}>
                    Exportar
                  </Button>
                  <Button size="sm" variant="subtle" onClick={() => setTimelineRun(run)}>
                    Timeline
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Drawer>

      {forkRun && (
        <ForkDialog
          run={forkRun}
          onClose={() => setForkRun(null)}
          onForked={handleForked}
          onOpenRun={openForkedRun}
        />
      )}
      {exportRun && <ExportDialog run={exportRun} onClose={() => setExportRun(null)} />}
      {timelineRun && <TimelineDialog run={timelineRun} onClose={() => setTimelineRun(null)} />}
    </>
  )
}
