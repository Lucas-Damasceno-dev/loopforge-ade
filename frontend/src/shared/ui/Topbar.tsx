import type { ReactNode } from 'react'
import { useWsStore } from '../../stores/wsStore'
import { useRunsStore } from '../../stores/runsStore'
import { shortId } from '../../features/trajectories/shortId'

export interface TopbarProps {
  /** Região central (ex.: trigger da command palette — Task 7). */
  center?: ReactNode
  /** Região direita (ações — Focus, etc.). */
  right?: ReactNode
}

// Status da conexão WS (01b §3.11): indicador PERSISTENTE na topbar —
// distinto do banner temporário de reconexão. Dot + label textual sempre
// presentes (o dot nunca é o único canal).
function connectionStatus(status: string): { tone: 'ok' | 'warn' | 'err'; label: string } {
  if (status === 'open') return { tone: 'ok', label: 'Connected' }
  if (status === 'connecting') return { tone: 'warn', label: 'Reconnecting…' }
  return { tone: 'err', label: 'Offline' }
}

const DOT: Record<'ok' | 'warn' | 'err', string> = {
  ok: 'bg-[var(--ok)]',
  warn: 'bg-[var(--warn)]',
  err: 'bg-[var(--err)]',
}

// Topbar (01b §3.11): 44px, bg --bg + border-b. Identidade (workspace + id
// curto da run ativa em mono), badge de status (WS + região `right` com
// ações) agrupados à direita; `center` é um slot central opcional (trigger da
// command palette — o CostBar virou BudgetPill flutuante no canvas, T4).
// Oculta em fullscreen (Focus mode, §6.1).
export function Topbar({ center, right }: TopbarProps) {
  const status = useWsStore((s) => s.status)
  const runs = useRunsStore((s) => s.runs)
  const activeRunId = useRunsStore((s) => s.activeRunId)

  const conn = connectionStatus(status)
  const activeRun = runs.find((r) => r.id === activeRunId) ?? null

  return (
    <header
      data-testid="topbar"
      className="ade-glass-subtle sticky top-0 z-40 flex h-11 shrink-0 items-center gap-3 border-b border-[var(--border)]/60 px-4"
    >
      <h1 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
        {/* Marca (P2-1): favicon reusado no header antes do nome. */}
        <img src="/favicon.svg" alt="" aria-hidden="true" className="h-4 w-4 drop-shadow-[0_0_8px_rgba(79,70,229,0.5)]" />
        <span className="bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">LoopForge ADE</span>
      </h1>
      {activeRun ? (
        <span className="font-mono text-xs font-medium text-[var(--accent-text)] bg-[var(--accent)]/10 border border-[var(--accent)]/20 px-2 py-0.5 rounded-md">{shortId(activeRun.id)}</span>
      ) : null}

      {center ? <div className="flex min-w-0 flex-1 justify-center px-2">{center}</div> : null}

      <div className="ml-auto flex min-w-0 items-center gap-2">
        <span
          aria-label={`Connection status: ${conn.label}`}
          title={conn.label}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-elev)]/80 px-2.5 py-0.5 backdrop-blur-xs"
        >
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${DOT[conn.tone]} shadow-[0_0_6px_currentColor]`} />
          <span className="text-xs font-medium text-[var(--text-dim)]">{conn.label}</span>
        </span>
        {right}
      </div>
    </header>
  )
}
