import { useRef, useState, useEffect, type KeyboardEvent } from 'react'
import { Badge, type BadgeProps } from '../../shared/ui/Badge'
import { CloseIcon } from '../../shared/ui/icons'
import type { Run, RunStatus } from '../../shared/lib/types'
import { shortId } from '../trajectories/shortId'
import type { CbSnapshot } from '../../stores/runsStore'

const STATUS_TONE: Record<RunStatus, BadgeProps['tone']> = {
  pending: 'neutral',
  queued: 'info',
  running: 'accent',
  paused: 'warn',
  completed: 'ok',
  failed: 'err',
}

function statusLabel(s: RunStatus): string {
  if (s === 'queued') return 'Queued'
  if (s === 'paused') return 'Paused'
  return s
}

// Ícone de stack (P1-4): sem ícone SVG no design system p/ stack → monograma
// (1ª letra) em span estilizado. Nunca emoji colorido.
function getStackMark(stack: string): string {
  const s = stack.toLowerCase()
  if (s.includes('python') || s.includes('fastapi')) return 'P'
  if (s.includes('java')) return 'J'
  if (s.includes('rust')) return 'R'
  if (s.includes('react') || s.includes('typescript') || s.includes('node')) return 'J'
  if (s.includes('go')) return 'G'
  return stack.trim() ? stack.trim()[0].toUpperCase() : '?'
}

export interface RunTabsProps {
  runs: Run[]
  activeRunId: string | null
  queue: string[]
  cbByRun: Record<string, CbSnapshot>
  onSelect: (id: string) => void
  onClose: (id: string) => void
}

function cbLabel(state: string): string {
  if (state === 'half-open') return 'H'
  if (state === 'open') return 'O'
  return 'C'
}

export function RunTabs({ runs, activeRunId, queue: _queue, cbByRun, onSelect, onClose }: RunTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const checkScroll = () => {
    if (!scrollRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
    setCanScrollLeft(scrollLeft > 2)
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 2)
  }

  useEffect(() => {
    checkScroll()
    window.addEventListener('resize', checkScroll)
    return () => window.removeEventListener('resize', checkScroll)
  }, [runs])

  const scrollBy = (offset: number) => {
    scrollRef.current?.scrollBy({ left: offset, behavior: 'smooth' })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = runs.findIndex((r) => r.id === activeRunId)
    if (idx === -1) return
    let next: Run | null = null
    if (e.key === 'ArrowRight') next = runs[(idx + 1) % runs.length]
    else if (e.key === 'ArrowLeft') next = runs[(idx - 1 + runs.length) % runs.length]
    else if (e.key === 'Home') next = runs[0]
    else if (e.key === 'End') next = runs[runs.length - 1]
    if (next) {
      e.preventDefault()
      onSelect(next.id)
      document.getElementById(`run-tab-${next.id}`)?.focus()
    }
  }

  const finishedRuns = runs.filter((r) => r.status === 'completed' || r.status === 'failed')

  return (
    <div className="relative flex items-center border-b border-[var(--border)] bg-[var(--bg)] px-2 py-1">
      {/* Scroll Left Button */}
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollBy(-150)}
          aria-label="Scroll tabs left"
          className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--bg-elev)] text-xs text-[var(--text-dim)] shadow-xs transition-colors hover:text-[var(--text)]"
        >
          ‹
        </button>
      )}

      {/* Tabs Container */}
      <div
        ref={scrollRef}
        role="tablist"
        aria-label="Runs"
        onScroll={checkScroll}
        onKeyDown={onKeyDown}
        className="flex flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {runs.map((run) => {
          const active = run.id === activeRunId
          const cbState = cbByRun[run.id]
          return (
            <div
              key={run.id}
              role="presentation"
              className={[
                'group flex items-center rounded-md border text-xs font-medium transition-all',
                active
                  ? 'border-[var(--border)] bg-[var(--bg-elev)] text-[var(--text)] shadow-xs ring-1 ring-[var(--accent)]/20'
                  : 'border-transparent bg-[var(--bg-elev)]/40 text-[var(--text-dim)] hover:bg-[var(--bg-elev)] hover:text-[var(--text)]',
              ].join(' ')}
            >
              <button
                id={`run-tab-${run.id}`}
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                onClick={() => onSelect(run.id)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs outline-none"
              >
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-[var(--accent)]/15 text-(--text-2xs) font-semibold text-[var(--accent-text)]"
                  title={run.stack}
                >
                  {getStackMark(run.stack)}
                </span>
                <span className="font-mono text-(--text-2xs) font-semibold">{shortId(run.id)}</span>
                <Badge tone={STATUS_TONE[run.status]}>{statusLabel(run.status)}</Badge>
                {run.degraded ? (
                  <Badge tone="warn" title={run.degraded_reason ?? undefined}>degraded</Badge>
                ) : null}
                {cbState ? (
                  <Badge tone={cbState.state === 'open' ? 'err' : 'neutral'} title={`circuit breaker ${cbState.state} · iters ${cbState.total_iterations} · $${cbState.total_cost.toFixed(2)}`}>
                    {cbLabel(cbState.state)}
                  </Badge>
                ) : null}
              </button>
              <button
                type="button"
                aria-label={`Close ${shortId(run.id)}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(run.id)
                }}
                className="mr-1 rounded p-0.5 text-[var(--text-dim)] opacity-60 transition-opacity duration-(--dur-fast) hover:text-[var(--err)] hover:opacity-100 group-hover:opacity-100 focus-visible:outline-none"
              >
                <CloseIcon />
              </button>
            </div>
          )
        })}
      </div>

      {/* Scroll Right Button */}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scrollBy(150)}
          aria-label="Scroll tabs right"
          className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--bg-elev)] text-xs text-[var(--text-dim)] shadow-xs transition-colors hover:text-[var(--text)]"
        >
          ›
        </button>
      )}

      {/* Clear Finished Runs Button */}
      {finishedRuns.length > 0 && runs.length > 1 && (
        <button
          type="button"
          onClick={() => {
            for (const r of finishedRuns) onClose(r.id)
          }}
          className="ml-2 shrink-0 rounded border border-[var(--border)] bg-[var(--bg-elev)] px-2 py-0.5 text-(--text-2xs) font-medium text-[var(--text-dim)] transition-colors hover:border-[var(--border-hover)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
          title="Close all finished runs"
        >
          Clear {finishedRuns.length} finished
        </button>
      )}
    </div>
  )
}
