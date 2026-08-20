import { useEffect, useRef, useState } from 'react'
import { Modal } from '../../shared/ui/Modal'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { SectionTitle } from '../../shared/ui/SectionTitle'
import { Alert } from '../../shared/ui/Alert'
import { Select } from '../../shared/ui/Select'
import { threadIdForRun } from '../../shared/lib/api'
import { getTrajectoryCheckpoints, getTrajectoryDiff } from '../../shared/lib/trajectory'
import type { TrajectoryCheckpoint, TrajectoryDiff } from '../../shared/lib/trajectory'
import type { Run } from '../../shared/lib/types'
import { trajectoryErrorMessage } from './errorMsg'
import { shortId } from './shortId'

export interface DiffPanelProps {
  run: Run
  onClose: () => void
}

function checkpointLabel(cp: TrajectoryCheckpoint): string {
  const ts = typeof cp.ts === 'string' && cp.ts.length > 0 ? ` · ${cp.ts.slice(11, 19)}` : ''
  const step = typeof cp.step === 'number' ? ` · step ${cp.step}` : ''
  const node = typeof cp.node === 'string' && cp.node.length > 0 ? ` · ${cp.node}` : ''
  return `${shortId(cp.checkpoint_id)}${step}${node}${ts}`
}

function DiffSection({
  title,
  items,
  type = 'default',
}: {
  title: string
  items: Array<[string, string]>
  type?: 'added' | 'removed' | 'changed' | 'default'
}) {
  if (items.length === 0) return null

  const toneClass =
    type === 'added'
      ? 'border-[var(--ok)]/20 bg-[var(--ok)]/5 text-[var(--ok-text)]'
      : type === 'removed'
        ? 'border-[var(--err)]/20 bg-[var(--err)]/5 text-[var(--err-text)]'
        : type === 'changed'
          ? 'border-[var(--warn)]/20 bg-[var(--warn)]/5 text-[var(--warn-text)]'
          : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-dim)]'

  return (
    <section className="mt-3" data-testid={`diff-section-${title.toLowerCase()}`}>
      <SectionTitle count={items.length}>{title}</SectionTitle>
      <ul className="mt-1.5 space-y-2">
        {items.map(([key, value]) => (
          <li key={key} className="rounded-md border border-[var(--border)] bg-[var(--bg-elev-2)] p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-semibold text-[var(--text)]">{key}</span>
              <span className={`rounded px-1.5 py-0.2 text-[10px] font-mono font-medium ${toneClass}`}>
                {type === 'added' ? '+ added' : type === 'removed' ? '- removed' : type === 'changed' ? 'Δ modified' : ''}
              </span>
            </div>
            <pre className={`mt-1.5 max-h-32 overflow-auto rounded border p-2 font-mono text-[11px] leading-relaxed [scrollbar-gutter:stable] ${toneClass}`}>
              {value}
            </pre>
          </li>
        ))}
      </ul>
    </section>
  )
}

// Diff de estado entre dois checkpoints (time-travel profundo): seleciona
// from/to da thread da run e mostra added/removed/changed com previews do
// backend. Modal com mesmo contrato dos irmãos ForkDialog/ExportDialog —
// auto-compara ao trocar a seleção (from≠to) e trata erros inline.
export function DiffPanel({ run, onClose }: DiffPanelProps) {
  const thread = threadIdForRun(run.id)
  const [checkpoints, setCheckpoints] = useState<TrajectoryCheckpoint[]>([])
  const [fromId, setFromId] = useState<string>('')
  const [toId, setToId] = useState<string>('')
  const [diff, setDiff] = useState<TrajectoryDiff | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const cancelled = useRef(false)

  // Carrega os metadados dos checkpoints (ordem cronológica do backend).
  useEffect(() => {
    cancelled.current = false
    setLoading(true)
    setError(null)
    getTrajectoryCheckpoints(thread)
      .then((cps) => {
        if (cancelled.current) return
        setCheckpoints(cps)
        if (cps.length >= 2) {
          setFromId(cps[0].checkpoint_id)
          setToId(cps[cps.length - 1].checkpoint_id)
        }
      })
      .catch((e) => {
        if (!cancelled.current) setError(trajectoryErrorMessage(e, 'Failed to load checkpoints'))
      })
      .finally(() => {
        if (!cancelled.current) setLoading(false)
      })
    return () => {
      cancelled.current = true
    }
  }, [thread])

  // Auto-compara quando from/to mudam (default = primeiro vs último).
  useEffect(() => {
    if (!fromId || !toId || fromId === toId) return
    let stale = false
    setDiff(null)
    getTrajectoryDiff(thread, fromId, toId)
      .then((d) => {
        if (!stale) setDiff(d)
      })
      .catch((e) => {
        if (!stale) setError(trajectoryErrorMessage(e, 'Failed to compute diff'))
      })
    return () => {
      stale = true
    }
  }, [thread, fromId, toId])

  const added = Object.entries(diff?.added ?? {})
  const removed = Object.entries(diff?.removed ?? {})
  const changed = (diff?.changed ?? []).map((c) => [c.key, `${c.before} → ${c.after}`] as [string, string])

  return (
    <Modal open title="Compare checkpoints" onClose={onClose} maxWidth={620}>
      <div className="flex max-h-[75vh] flex-col p-4">
        <h2 className="text-lg font-semibold text-[var(--text)]">Compare checkpoints</h2>
        <p className="mt-1 text-sm text-[var(--text-dim)]">
          Run <span className="font-mono text-[var(--text)]">{shortId(run.id)}</span> — graph state diff between two
          checkpoints of thread <span className="font-mono">{shortId(thread)}</span>.
        </p>

        {error && (
          <Alert tone="err" className="mt-3">{error}</Alert>
        )}

        {loading ? (
          <p className="py-6 text-center text-sm text-[var(--text-dim)]">Loading checkpoints…</p>
        ) : checkpoints.length < 2 ? (
          <div className="py-6">
            <EmptyState
              title={checkpoints.length === 0 ? 'No checkpoints' : 'Not enough checkpoints'}
              description={
                checkpoints.length === 0
                  ? 'This run has no recorded trajectory to compare.'
                  : 'At least 2 checkpoints are required to compute a diff.'
              }
            />
          </div>
        ) : (
          <>
            <div className="mt-3 flex items-center gap-2" data-testid="diff-selectors">
              <label htmlFor="diff-from" className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-[var(--text-dim)]">
                From
                <Select
                  id="diff-from"
                  aria-label="From checkpoint"
                  className="w-full"
                  value={fromId}
                  onChange={(e) => setFromId(e.target.value)}
                >
                  {checkpoints.map((cp) => (
                    <option key={cp.checkpoint_id} value={cp.checkpoint_id}>
                      {checkpointLabel(cp)}
                    </option>
                  ))}
                </Select>
              </label>
              <span className="text-xs text-[var(--text-dim)]" aria-hidden="true">
                →
              </span>
              <label htmlFor="diff-to" className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-[var(--text-dim)]">
                To
                <Select
                  id="diff-to"
                  aria-label="To checkpoint"
                  className="w-full"
                  value={toId}
                  onChange={(e) => setToId(e.target.value)}
                >
                  {checkpoints.map((cp) => (
                    <option key={cp.checkpoint_id} value={cp.checkpoint_id}>
                      {checkpointLabel(cp)}
                    </option>
                  ))}
                </Select>
              </label>
            </div>

            {diff && (
              <div className="mt-2 min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]" data-testid="diff-results">
                <DiffSection title="Added" items={added} type="added" />
                <DiffSection title="Removed" items={removed} type="removed" />
                <DiffSection title="Changed" items={changed} type="changed" />
                {added.length === 0 && removed.length === 0 && changed.length === 0 && (
                  <p className="mt-4 text-center text-sm text-[var(--text-dim)]">No state changes between these checkpoints.</p>
                )}
              </div>
            )}
          </>
        )}

        <div className="mt-4 flex justify-end">
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  )
}
