import type { ReactNode } from 'react'
import { useWsStore } from '../../stores/wsStore'
import { useRunsStore } from '../../stores/runsStore'
import { Button } from './Button'

export interface TopbarProps {
  /** Ação do menu global (<1280px abre o rail como drawer — extensão). */
  onMenu?: () => void
  /** Região direita (cost bar, ações). */
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

function shortId(id: string): string {
  if (id.startsWith('demo-')) return `demo-${id.slice(-4)}`
  return id.length > 10 ? `#${id.slice(-6)}` : id
}

// Topbar (01b §3.11): 44px, bg --bg + border-b. Identidade (workspace + id
// curto da run ativa em mono), indicador persistente de conexão WS, ações à
// direita. Oculta em fullscreen (F11, §6.1).
export function Topbar({ onMenu, right }: TopbarProps) {
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
      <h1 className="text-sm font-semibold text-[var(--text)]">LoopForge ADE</h1>
      {activeRun ? (
        <span className="font-mono text-xs text-[var(--text-dim)]">{shortId(activeRun.id)}</span>
      ) : null}

      <span
        aria-label={`Connection status: ${conn.label}`}
        title={conn.label}
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-elev)] px-2 py-0.5"
      >
        <span aria-hidden="true" className={`h-2 w-2 rounded-full ${DOT[conn.tone]}`} />
        <span className="text-xs text-[var(--text-dim)]">{conn.label}</span>
      </span>

      <div className="ml-auto flex items-center gap-3">
        {right}
        {onMenu ? (
          <Button size="sm" variant="ghost" onClick={onMenu}>
            Menu
          </Button>
        ) : null}
      </div>
    </header>
  )
}
