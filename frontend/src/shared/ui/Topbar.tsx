import type { ReactNode } from 'react'
import { useWsStore } from '../../stores/wsStore'
import { useRunsStore } from '../../stores/runsStore'
import { shortId } from '../../features/trajectories/shortId'

export interface TopbarProps {
  /** Região direita (cost bar, navegação). */
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
// curto da run ativa em mono), badges de status (WS + região `right` com
// CostBar/navegação) agrupados à direita. Oculta em fullscreen (Focus mode,
// §6.1). Navegação de views vive no ActivityRail (T2) — esta região `right`
// carrega apenas ações (CostBar, Focus).
export function Topbar({ right }: TopbarProps) {
  const status = useWsStore((s) => s.status)
  const runs = useRunsStore((s) => s.runs)
  const activeRunId = useRunsStore((s) => s.activeRunId)

  const conn = connectionStatus(status)
  const activeRun = runs.find((r) => r.id === activeRunId) ?? null

  return (
    <header
      data-testid="topbar"
      className="flex h-11 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--bg)] px-4"
    >
      <h1 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text)]">
        {/* Marca (P2-1): favicon reusado no header antes do nome. */}
        <img src="/favicon.svg" alt="" aria-hidden="true" className="h-4 w-4" />
        LoopForge ADE
      </h1>
      {activeRun ? (
        <span className="font-mono text-xs text-[var(--text-dim)]">{shortId(activeRun.id)}</span>
      ) : null}

      <div className="ml-auto flex min-w-0 items-center gap-2">
        <span
          aria-label={`Connection status: ${conn.label}`}
          title={conn.label}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-elev)] px-2 py-0.5"
        >
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${DOT[conn.tone]}`} />
          <span className="text-xs text-[var(--text-dim)]">{conn.label}</span>
        </span>
        {right}
      </div>
    </header>
  )
}
