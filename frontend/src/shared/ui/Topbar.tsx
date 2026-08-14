import type { ReactNode } from 'react'
import { useWsStore } from '../../stores/wsStore'
import { useRunsStore } from '../../stores/runsStore'
import { Button } from './Button'
import { Icon } from './icons'
import type { IconName } from './icons'
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
// (title). Ícones vêm de ./icons (fonte única com o ActivityRail).
export interface TopbarActionProps {
  /** Rótulo acessível (aria-label/tooltip) — exibido ≥1024px. */
  label: string
  /** Estado ativo → preenchimento do segmented control. */
  active?: boolean
  onClick: () => void
  /** Chave de ícone inline (ver ICONS em ./icons). */
  icon?: IconName
  /** Força o rótulo sempre visível (rail vertical) — default: só ≥1024px. */
  showLabel?: boolean
}

export function TopbarAction({ label, active = false, onClick, icon, showLabel = false }: TopbarActionProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={label}
      aria-label={label}
      onClick={onClick}
      className={[
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded px-2 text-xs font-medium transition-colors duration-[var(--dur-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
        active ? 'bg-[var(--bg-elev-2)] text-[var(--text)]' : 'text-[var(--text-dim)] hover:bg-[var(--bg-elev)] hover:text-[var(--text)]',
      ].join(' ')}
    >
      {icon ? <Icon name={icon} /> : null}
      <span className={showLabel ? 'inline' : 'hidden lg:inline'}>{label}</span>
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
        {onMenu ? (
          /* P1-1: botão Menu só <1024px (≥lg o nav inline assume). */
          <Button size="sm" variant="ghost" onClick={onMenu} className="lg:hidden">
            Menu
          </Button>
        ) : null}
      </div>
    </header>
  )
}
