import { useEffect, useMemo, useRef } from 'react'
import { useConsoleStore } from '../../stores/consoleStore'
import type { ConsoleFilters, LogLevel } from '../../stores/consoleStore'
import { NODE_LABELS, PIPELINE_ORDER } from '../dag/dagModel'
import { Button } from '../../shared/ui/Button'

// Console filtrável (E6): painel fixo inferior (UX1) — leitura das entradas do
// consoleStore (escritas pelo wiring do WS, T5). Filtros atuam na SELEÇÃO
// (useMemo), as entradas ficam intactas no store.
const LEVELS: LogLevel[] = ['info', 'warn', 'error']

const LEVEL_COLORS: Record<LogLevel, string> = {
  info: 'text-[var(--text-dim)]',
  warn: 'text-[var(--warn)]',
  error: 'text-[var(--err)]',
}

const controlCls =
  'rounded-md border border-[var(--border)] bg-[var(--bg-elev)] px-2 py-1 text-xs text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]'

function formatTs(ts: number): string {
  return new Date(ts).toLocaleTimeString()
}

export function ConsolePanel({ className = '' }: { className?: string }) {
  const entries = useConsoleStore((s) => s.entries)
  const filters = useConsoleStore((s) => s.filters)
  const autoScroll = useConsoleStore((s) => s.autoScroll)
  const setFilters = useConsoleStore((s) => s.setFilters)
  const toggleAutoScroll = useConsoleStore((s) => s.toggleAutoScroll)
  const clear = useConsoleStore((s) => s.clear)
  const listRef = useRef<HTMLDivElement>(null)

  // Seleção derivada: nó + nível + busca (case-insensitive sobre a mensagem).
  const visible = useMemo(() => {
    const q = filters.query.trim().toLowerCase()
    return entries.filter((e) => {
      if (filters.node !== 'all' && e.node !== filters.node) return false
      if (filters.level !== 'all' && e.level !== filters.level) return false
      if (q && !e.message.toLowerCase().includes(q)) return false
      return true
    })
  }, [entries, filters])

  // Autoscroll: com autoScroll ligado, conteúdo/filtro novo rola ao fundo.
  useEffect(() => {
    const el = listRef.current
    if (!el || !autoScroll) return
    el.scrollTop = el.scrollHeight
  }, [visible.length, autoScroll])

  // Usuário subiu o scroll (longe do fundo): desliga o autoscroll; o botão
  // ⏸/▶ retoma manualmente.
  const handleScroll = () => {
    const el = listRef.current
    if (!el || !autoScroll) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (!atBottom) toggleAutoScroll()
  }

  return (
    <div data-testid="console-panel" className={`flex flex-col border-t border-[var(--border)] bg-[var(--bg)] ${className}`}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-1.5">
        <h2 className="mr-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-dim)]">Console</h2>
        <select
          aria-label="Filter by node"
          className={controlCls}
          value={filters.node}
          onChange={(e) => setFilters({ node: e.target.value as ConsoleFilters['node'] })}
        >
          <option value="all">All nodes</option>
          {PIPELINE_ORDER.map((node) => (
            <option key={node} value={node}>
              {NODE_LABELS[node]}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by level"
          className={controlCls}
          value={filters.level}
          onChange={(e) => setFilters({ level: e.target.value as ConsoleFilters['level'] })}
        >
          <option value="all">All levels</option>
          {LEVELS.map((level) => (
            <option key={level} value={level}>
              {level.toUpperCase()}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Search logs…"
          aria-label="Search logs"
          className={`${controlCls} min-w-40`}
          value={filters.query}
          onChange={(e) => setFilters({ query: e.target.value })}
        />
        <Button size="sm" variant="ghost" aria-pressed={autoScroll} aria-label="Auto-scroll" title={autoScroll ? 'Pause auto-scroll' : 'Resume auto-scroll'} onClick={toggleAutoScroll}>
          {autoScroll ? '⏸' : '▶'}
        </Button>
        <Button size="sm" variant="subtle" aria-label="Clear logs" onClick={clear}>
          Clear
        </Button>
      </div>
      <div ref={listRef} role="list" onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 font-mono text-xs leading-5">
        {visible.length === 0 ? (
          <p className="mt-1 text-[var(--text-dim)]">No matching logs</p>
        ) : (
          visible.map((e) => (
            <div key={e.id} role="listitem" data-testid="console-entry" className={LEVEL_COLORS[e.level]}>
              [{formatTs(e.ts)}] [{e.node ?? 'system'}] [{e.level.toUpperCase()}] {e.message}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
