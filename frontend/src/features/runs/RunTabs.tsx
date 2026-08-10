import type { KeyboardEvent } from 'react'
import { Badge, type BadgeProps } from '../../shared/ui/Badge'
import type { Run, RunStatus } from '../../shared/lib/types'
import { shortId } from '../trajectories/shortId'

// status da run → tone do badge na aba (zinc/azul/verde/vermelho/âmbar).
// queued/paused (novos, contrato v1): info (--info) e warn (--warn).
const STATUS_TONE: Record<RunStatus, BadgeProps['tone']> = {
  pending: 'neutral',
  queued: 'info',
  running: 'accent',
  paused: 'warn',
  completed: 'ok',
  failed: 'err',
}

// Rótulo curto da aba: os dois estados novos em EN; demais mantêm o texto
// cru do status (sem redesenho — compatível com o mapeamento existente).
function statusLabel(s: RunStatus): string {
  if (s === 'queued') return 'Queued'
  if (s === 'paused') return 'Paused'
  return s
}

export interface RunTabsProps {
  runs: Run[]
  activeRunId: string | null
  queue: string[]
  onSelect: (id: string) => void
  onClose: (id: string) => void
}

// Abas das runs (UX11): 1 visível por vez, badge de status, indicador de fila.
// a11y (UX20): role=tablist/tab, aria-selected, roving tabindex + setas.
export function RunTabs({ runs, activeRunId, queue, onSelect, onClose }: RunTabsProps) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = runs.findIndex((r) => r.id === activeRunId)
    if (idx === -1) return
    let next: Run | null = null
    if (e.key === 'ArrowRight') next = runs[(idx + 1) % runs.length]
    else if (e.key === 'ArrowLeft') next = runs[(idx - 1 + runs.length) % runs.length]
    if (next) {
      e.preventDefault()
      onSelect(next.id)
      document.getElementById(`run-tab-${next.id}`)?.focus()
    }
  }

  return (
    <div
      role="tablist"
      aria-label="Runs"
      onKeyDown={onKeyDown}
      className="flex items-center gap-1 overflow-x-auto border-b border-[var(--border)] px-2 py-1.5"
    >
      {runs.map((run) => {
        const active = run.id === activeRunId
        const queued = queue.includes(run.id)
        return (
          <div key={run.id} role="presentation" className="flex items-center">
            <button
              id={`run-tab-${run.id}`}
              role="tab"
              aria-selected={active}
              aria-controls={`run-panel-${run.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => onSelect(run.id)}
              className={[
                'flex items-center gap-2 rounded-t-md border border-b-0 px-3 py-1.5 text-xs font-medium',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
                active
                  ? 'border-[var(--border)] bg-[var(--bg-elev)] text-[var(--text)]'
                  : 'border-transparent text-[var(--text-dim)] hover:text-[var(--text)]',
              ].join(' ')}
            >
              <span>{shortId(run.id)}</span>
              <Badge tone={STATUS_TONE[run.status]}>{statusLabel(run.status)}</Badge>
              {queued ? (
                <span className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">queued</span>
              ) : null}
            </button>
            <button
              type="button"
              aria-label={`Close ${shortId(run.id)}`}
              onClick={(e) => {
                e.stopPropagation()
                onClose(run.id)
              }}
              className="rounded px-1 text-[var(--text-dim)] transition-colors duration-100 hover:text-[var(--err)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
