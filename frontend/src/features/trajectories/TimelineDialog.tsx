import { useEffect, useRef, useState } from 'react'
import { Modal } from '../../shared/ui/Modal'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { getRunTimeline } from '../../shared/lib/api'
import { normalizeNodeName } from '../../shared/lib/ws'
import { nodeAccentVar } from '../dag/nodeAccent'
import type { Run, TimelineEntry } from '../../shared/lib/types'
import { trajectoryErrorMessage } from './errorMsg'
import { shortId } from './shortId'

const PAGE_SIZE = 50

// Timestamp da timeline é epoch ms (eventos) OU string ISO (checkpoints
// LangGraph) — normaliza para exibição pt-BR (hora + data curta).
function formatTs(ts: number | string): string {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return String(ts)
  return `${d.toLocaleTimeString('pt-BR', { hour12: false })} ${d.toLocaleDateString('pt-BR')}`
}

// Rótulo curto do evento (best-effort: a timeline só carrega o payload, não o
// nome do evento — inferimos dos campos presentes; senão, "Event").
function describeEvent(data: Record<string, unknown>): string {
  if (typeof data.node === 'string' && typeof data.status === 'string') return `${data.node} (${data.status})`
  if (typeof data.idea === 'string' && data.idea.length > 0) return 'Pipeline started'
  if (typeof data.status === 'string') return `Status: ${data.status}`
  if (typeof data.action === 'string') return `Decision: ${data.action}`
  return 'Event'
}

function TimelineRow({ entry }: { entry: TimelineEntry }) {
  const nodeType = normalizeNodeName(entry.node)
  const color = nodeType ? nodeAccentVar(nodeType) : 'var(--text-dim)'
  const isCheckpoint = entry.type === 'checkpoint'
  const label = isCheckpoint ? 'Checkpoint' : describeEvent(entry.data)
  const checkpointId = isCheckpoint && typeof entry.data.checkpoint_id === 'string' ? entry.data.checkpoint_id : null

  return (
    <li className="flex gap-2 py-1.5" data-testid="timeline-entry">
      <span
        aria-hidden="true"
        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
        style={{ background: color }}
        title={isCheckpoint ? 'checkpoint' : 'event'}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="font-mono text-[10px] text-[var(--text-dim)]">#{entry.seq}</span>
          <span className="truncate font-medium text-[var(--text)]">{label}</span>
          {entry.node ? (
            <span
              className="shrink-0 rounded px-1 text-[10px] font-medium"
              style={{ color, border: `1px solid ${color}55` }}
            >
              {entry.node}
            </span>
          ) : null}
          <span className="ml-auto shrink-0 font-mono text-[10px] text-[var(--text-dim)]">{formatTs(entry.timestamp)}</span>
        </div>
        {(isCheckpoint || Object.keys(entry.data).length > 0) && (
          <details className="mt-0.5">
            <summary className="cursor-pointer text-[11px] text-[var(--text-dim)] transition-colors duration-100 hover:text-[var(--text)]">
              {isCheckpoint ? `checkpoint ${checkpointId ? shortId(checkpointId) : ''} — details` : 'details'}
            </summary>
            <pre className="mt-1 max-h-40 overflow-auto rounded border border-[var(--border)] bg-[var(--bg)] p-2 font-mono text-[10px] leading-4 text-[var(--text-dim)]">
              {JSON.stringify(entry.data, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </li>
  )
}

// Timeline unificada da run (C5/M-02): GET /runs/{id}/timeline?after_seq=&limit=
// — eventos do journal + checkpoints LangGraph intercalados por seq, com
// paginação "carregar mais" (after_seq = seq do último item). Ícone distinto
// por tipo (evento/checkpoint) e cor por nó via --node-*.
export function TimelineDialog({ run, onClose }: { run: Run; onClose: () => void }) {
  const [entries, setEntries] = useState<TimelineEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [nextAfterSeq, setNextAfterSeq] = useState<number | null>(null)
  const [total, setTotal] = useState(0)
  const cancelled = useRef(false)

  const load = async (afterSeq: number) => {
    try {
      const res = await getRunTimeline(run.id, afterSeq, PAGE_SIZE)
      if (cancelled.current) return
      setEntries((prev) => (afterSeq === 0 ? res.timeline : [...prev, ...res.timeline]))
      setHasMore(res.has_more)
      setNextAfterSeq(res.next_after_seq)
      setTotal(res.total_count)
      setError(null)
    } catch (e) {
      if (!cancelled.current) setError(trajectoryErrorMessage(e, 'Failed to load timeline'))
    }
  }

  useEffect(() => {
    cancelled.current = false
    setLoading(true)
    load(0).finally(() => {
      if (!cancelled.current) setLoading(false)
    })
    return () => {
      cancelled.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.id])

  const loadMore = async () => {
    if (nextAfterSeq === null) return
    setLoadingMore(true)
    await load(nextAfterSeq)
    setLoadingMore(false)
  }

  return (
    <Modal open title="Run timeline" onClose={onClose} maxWidth={560}>
      <div className="flex max-h-[70vh] flex-col p-4">
        <h2 className="text-lg font-semibold text-[var(--text)]">Run timeline</h2>
        <p className="mt-1 text-sm text-[var(--text-dim)]">
          <span className="font-mono text-[var(--text)]">{shortId(run.id)}</span> — journal events and checkpoints
          interleaved{total > 0 ? ` (${total} total)` : ''}.
        </p>

        {error && (
          <div
            role="alert"
            className="mt-3 rounded-md border border-[var(--err)]/30 bg-[var(--err)]/15 px-3 py-2 text-sm text-[var(--err-text)]"
          >
            {error}
          </div>
        )}

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          {loading ? (
            <p className="py-6 text-center text-sm text-[var(--text-dim)]">Loading timeline…</p>
          ) : entries.length === 0 ? (
            <EmptyState title="No events" description="This run has no timeline recorded yet." />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {entries.map((entry) => (
                <TimelineRow key={`${entry.type}-${entry.seq}`} entry={entry} />
              ))}
            </ul>
          )}
        </div>

        {hasMore && !loading && (
          <div className="mt-3 flex justify-center">
            <Button size="sm" variant="subtle" disabled={loadingMore} onClick={loadMore}>
              {loadingMore ? 'Loading…' : `Load more (${total - entries.length} remaining)`}
            </Button>
          </div>
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
