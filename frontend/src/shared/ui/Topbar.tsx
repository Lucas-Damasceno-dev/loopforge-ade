import type { ReactNode } from 'react'
import { useWsStore } from '../../stores/wsStore'
import { useRunsStore } from '../../stores/runsStore'
import { Button } from './Button'
import { shortId } from '../../features/trajectories/shortId'

export interface TopbarProps {
  /** Ação do menu global (<1280px abre o rail como drawer — extensão). */
  onMenu?: () => void
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

// ─── TopbarAction ────────────────────────────────────────────────────────
// Item de navegação estilo segmented control (auditoria Lane B): pill com
// preenchimento no item ativo (aria-pressed), ícone inline sempre visível,
// rótulo escondido <1024px (lg:inline) — abaixo disso só ícone + tooltip
// (title). Nenhuma lib nova: SVGs inline em stroke currentColor (lucide-style).
export interface TopbarActionProps {
  /** Rótulo acessível (aria-label/tooltip) — exibido ≥1024px. */
  label: string
  /** Estado ativo → preenchimento do segmented control. */
  active?: boolean
  onClick: () => void
  /** Chave de ícone inline (ver ICONS abaixo). */
  icon?: keyof typeof ICONS
}

const ICONS = {
  trajectories: (
    <>
      <line x1="6" x2="6" y1="3" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </>
  ),
  mcp: (
    <>
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" x2="20" y1="19" y2="19" />
    </>
  ),
  memory: (
    <>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14a9 3 0 0 0 18 0V5" />
      <path d="M3 12a9 3 0 0 0 18 0" />
    </>
  ),
  evals: (
    <>
      <line x1="18" x2="18" y1="20" y2="10" />
      <line x1="12" x2="12" y1="20" y2="4" />
      <line x1="6" x2="6" y1="20" y2="14" />
    </>
  ),
  git: (
    <>
      <circle cx="12" cy="12" r="3" />
      <line x1="3" x2="9" y1="12" y2="12" />
      <line x1="15" x2="21" y1="12" y2="12" />
    </>
  ),
  health: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />,
  prompts: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  settings: (
    <>
      <line x1="21" x2="14" y1="4" y2="4" />
      <line x1="10" x2="3" y1="4" y2="4" />
      <line x1="21" x2="12" y1="12" y2="12" />
      <line x1="8" x2="3" y1="12" y2="12" />
      <line x1="21" x2="16" y1="20" y2="20" />
      <line x1="12" x2="3" y1="20" y2="20" />
      <line x1="14" x2="14" y1="2" y2="6" />
      <line x1="8" x2="8" y1="10" y2="14" />
      <line x1="16" x2="16" y1="18" y2="22" />
    </>
  ),
} as const

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5 shrink-0"
    >
      {ICONS[name]}
    </svg>
  )
}

export function TopbarAction({ label, active = false, onClick, icon }: TopbarActionProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={label}
      aria-label={label}
      onClick={onClick}
      className={[
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded px-2 text-xs font-medium transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
        active ? 'bg-[var(--bg-elev-2)] text-[var(--text)]' : 'text-[var(--text-dim)] hover:bg-[var(--bg-elev)] hover:text-[var(--text)]',
      ].join(' ')}
    >
      {icon ? <Icon name={icon} /> : null}
      <span className="hidden lg:inline">{label}</span>
    </button>
  )
}

// Topbar (01b §3.11): 44px, bg --bg + border-b. Identidade (workspace + id
// curto da run ativa em mono), badges de status (WS + região `right` com
// CostBar/navegação) agrupados à direita. Oculta em fullscreen (Focus mode,
// §6.1).
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
        {onMenu ? (
          <Button size="sm" variant="ghost" onClick={onMenu}>
            Menu
          </Button>
        ) : null}
      </div>
    </header>
  )
}
