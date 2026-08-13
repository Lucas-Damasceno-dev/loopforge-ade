import { useEffect, useMemo, useRef, useState } from 'react'
import { useConsoleStore } from '../../stores/consoleStore'
import type { ConsoleFilters, LogLevel } from '../../stores/consoleStore'
import { NODE_LABELS, PIPELINE_ORDER } from '../dag/dagModel'
import { Button } from '../../shared/ui/Button'
import { Input } from '../../shared/ui/Input'
import { Select } from '../../shared/ui/Select'
import { EmptyState } from '../../shared/ui/EmptyState'

// Console filtrável (E6): painel fixo inferior (UX1) — leitura das entradas do
// consoleStore (escritas pelo wiring do WS, T5). Filtros atuam na SELEÇÃO
// (useMemo), as entradas ficam intactas no store. Filtro de nível por chips
// toggle (01b §3.7: aria-pressed, ativo = bg-elev-2 + texto full).
//
// Retrátil (auditoria P0.5): sem entries E sem streams → painel colapsado em
// linha única (título + hint + chevron); ao primeiro log/stream expande
// automaticamente; toggle manual no chevron. Altura expandida vem do className
// do App (h-60).
const LEVELS: LogLevel[] = ['info', 'warn', 'error']

const LEVEL_COLORS: Record<LogLevel, string> = {
  info: 'text-[var(--text-dim)]',
  warn: 'text-[var(--warn-text)]', // 12px normal não alcança 4.5:1 com --warn (§2.3)
  error: 'text-[var(--err-text)]', // 12px normal não alcança 4.5:1 com --err (§2.3)
}

const chipCls = (active: boolean) =>
  [
    'rounded px-2 py-1 text-xs font-medium transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
    active ? 'bg-[var(--bg-elev-2)] text-[var(--text)]' : 'text-[var(--text-dim)] hover:text-[var(--text)]',
  ].join(' ')

// Chevron de colapso (auditoria): mesmo estilo do close do Drawer.
const chevronCls =
  'rounded p-1 text-[var(--text-dim)] transition-colors duration-100 hover:bg-[var(--bg-elev)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]'

function formatTs(ts: number): string {
  return new Date(ts).toLocaleTimeString()
}

export function ConsolePanel({ className = '' }: { className?: string }) {
  const entries = useConsoleStore((s) => s.entries)
  const streams = useConsoleStore((s) => s.streams)
  const filters = useConsoleStore((s) => s.filters)
  const autoScroll = useConsoleStore((s) => s.autoScroll)
  const setFilters = useConsoleStore((s) => s.setFilters)
  const toggleAutoScroll = useConsoleStore((s) => s.toggleAutoScroll)
  const clear = useConsoleStore((s) => s.clear)
  const listRef = useRef<HTMLDivElement>(null)

  const hasContent = entries.length > 0 || Object.keys(streams).length > 0

  // Colapso local (não persiste): vazio → colapsado no mount; transições de
  // conteúdo (vazio→logs, logs→vazio) expandem/colapsam automaticamente.
  // Manual (chevron) prevalece até a próxima transição de conteúdo.
  const [collapsed, setCollapsed] = useState(!hasContent)
  const hadContent = useRef(hasContent)

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

  // Streams de token a token (V1.1/ADR-0007): tratados como nível info —
  // somem sob filtro warn/error; nó/query seguem os filtros comuns.
  const streamList = useMemo(() => Object.values(streams), [streams])
  const visibleStreams = useMemo(() => {
    const q = filters.query.trim().toLowerCase()
    return streamList.filter((s) => {
      if (filters.node !== 'all' && s.node !== filters.node) return false
      if (filters.level !== 'all' && filters.level !== 'info') return false
      if (q && !s.content.toLowerCase().includes(q)) return false
      return true
    })
  }, [streamList, filters])

  // Auto-expand/collapse: primeiro log expande; esvaziar recolhe (auditoria
  // P0.5). Só na TRANSIÇÃO — colapso manual com conteúdo permanece.
  useEffect(() => {
    if (hasContent && !hadContent.current) setCollapsed(false)
    if (!hasContent && hadContent.current) setCollapsed(true)
    hadContent.current = hasContent
  }, [hasContent])

  // Autoscroll: com autoScroll ligado, conteúdo/filtro novo rola ao fundo.
  useEffect(() => {
    const el = listRef.current
    if (!el || !autoScroll) return
    el.scrollTop = el.scrollHeight
  }, [visible.length, visibleStreams.length, autoScroll])

  // Usuário subiu o scroll (longe do fundo): desliga o autoscroll; o botão
  // Pause/Resume retoma manualmente.
  const handleScroll = () => {
    const el = listRef.current
    if (!el || !autoScroll) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (!atBottom) toggleAutoScroll()
  }

  return (
    <div
      data-testid="console-panel"
      className={`flex shrink-0 flex-col border-t border-[var(--border)] bg-[var(--bg)] ${collapsed ? '' : className}`}
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-1.5">
        <h2 className="mr-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-dim)]">Console</h2>
        {collapsed ? (
          <>
            <span className="text-xs text-[var(--text-dim)]">
              {hasContent ? `${entries.length + streamList.length} ${entries.length + streamList.length === 1 ? 'log' : 'logs'}` : 'No logs'}
            </span>
            <button
              type="button"
              aria-label="Expand console"
              aria-expanded={false}
              onClick={() => setCollapsed(false)}
              className={`ml-auto ${chevronCls}`}
            >
              ▸
            </button>
          </>
        ) : (
          <>
            <Select
              aria-label="Filter by node"
              value={filters.node}
              onChange={(e) => setFilters({ node: e.target.value as ConsoleFilters['node'] })}
            >
              <option value="all">All nodes</option>
              {PIPELINE_ORDER.map((node) => (
                <option key={node} value={node}>
                  {NODE_LABELS[node]}
                </option>
              ))}
            </Select>
            <div role="group" aria-label="Filter by level" className="flex items-center gap-0.5 rounded-md border border-[var(--border)] bg-[var(--bg-elev)] p-0.5">
              {(['all', ...LEVELS] as const).map((level) => {
                const active = filters.level === level
                return (
                  <button
                    key={level}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilters({ level: level as ConsoleFilters['level'] })}
                    className={chipCls(active)}
                  >
                    {level === 'all' ? 'All' : level.toUpperCase()}
                  </button>
                )
              })}
            </div>
            <Input
              type="search"
              placeholder="Search logs…"
              aria-label="Search logs"
              className="min-w-40"
              value={filters.query}
              onChange={(e) => setFilters({ query: e.target.value })}
            />
            <Button size="sm" variant="ghost" aria-pressed={autoScroll} aria-label="Auto-scroll" title={autoScroll ? 'Pause auto-scroll' : 'Resume auto-scroll'} onClick={toggleAutoScroll}>
              {autoScroll ? 'Pause' : 'Resume'}
            </Button>
            <Button size="sm" variant="subtle" aria-label="Clear logs" onClick={clear}>
              Clear
            </Button>
            <button
              type="button"
              aria-label="Collapse console"
              aria-expanded={true}
              onClick={() => setCollapsed(true)}
              className={chevronCls}
            >
              ▾
            </button>
          </>
        )}
      </div>
      {!collapsed && (
        <div
          ref={listRef}
          role="list"
          onScroll={handleScroll}
          className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 font-mono text-xs leading-5 [scrollbar-gutter:stable]"
        >
          {entries.length === 0 && streamList.length === 0 ? (
            <EmptyState compact title="No console output yet" />
          ) : visible.length === 0 && visibleStreams.length === 0 ? (
            <p className="mt-1 text-[var(--text-dim)]">No matching logs</p>
          ) : (
            <>
              {visible.map((e) => (
                <div key={e.id} role="listitem" data-testid="console-entry" className={LEVEL_COLORS[e.level]}>
                  [{formatTs(e.ts)}] [{e.node ?? 'system'}] [{e.level.toUpperCase()}] {e.message}
                </div>
              ))}
              {visibleStreams.map((s) => (
                <div key={s.node} role="listitem" data-testid="console-stream" className={LEVEL_COLORS.info}>
                  [{formatTs(s.ts)}] [{s.node}] [STREAM] {s.content}
                  <span className="console-stream-cursor" />
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
