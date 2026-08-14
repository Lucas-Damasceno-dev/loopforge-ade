import { useEffect, useMemo, useRef } from 'react'
import { useConsoleStore } from '../../stores/consoleStore'
import type { ConsoleFilters, LogLevel } from '../../stores/consoleStore'
import { NODE_LABELS, PIPELINE_ORDER } from '../dag/dagModel'
import { Button } from '../../shared/ui/Button'
import { Input } from '../../shared/ui/Input'
import { Select } from '../../shared/ui/Select'
import { EmptyState } from '../../shared/ui/EmptyState'
import { IconTabBar } from '../../shared/ui/IconTabBar'

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

// Teto de retenção (auditoria): evita DOM sem limite em runs longas — exibe
// as últimas 2000 entradas e avisa quando houve corte.
const MAX_CONSOLE_ENTRIES = 2000

const LEVEL_COLORS: Record<LogLevel, string> = {
  info: 'text-[var(--text-dim)]',
  warn: 'text-[var(--warn-text)]', // 12px normal não alcança 4.5:1 com --warn (§2.3)
  error: 'text-[var(--err-text)]', // 12px normal não alcança 4.5:1 com --err (§2.3)
}

const chipCls = (active: boolean) =>
  [
    'rounded px-2 py-1 text-xs font-medium transition-colors duration-(--dur-fast) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
    active ? 'bg-[var(--bg-elev-2)] text-[var(--text)]' : 'text-[var(--text-dim)] hover:text-[var(--text)]',
  ].join(' ')

// Chevron de colapso (auditoria): mesmo estilo do close do Drawer.
const chevronCls =
  'rounded p-1 text-[var(--text-dim)] transition-colors duration-(--dur-fast) hover:bg-[var(--bg-elev)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]'

function formatTs(ts: number): string {
  return new Date(ts).toLocaleTimeString()
}

function renderHighlighted(text: string, query: string) {
  const q = query.trim()
  if (!q) return text
  const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  const parts = text.split(regex)
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark key={i} className="rounded-xs bg-[var(--warn)]/30 px-0.5 font-semibold text-[var(--warn-text)]">
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

const STORAGE_KEY_CONSOLE_COLLAPSED = 'lf_console_collapsed'

function getSavedCollapsed(): boolean | null {
  try {
    const val = localStorage.getItem(STORAGE_KEY_CONSOLE_COLLAPSED)
    return val !== null ? val === 'true' : null
  } catch {
    return null
  }
}

export function ConsolePanel({ className = '', onOpenTerminal }: { className?: string; onOpenTerminal?: () => void }) {
  const entries = useConsoleStore((s) => s.entries)
  const streams = useConsoleStore((s) => s.streams)
  const filters = useConsoleStore((s) => s.filters)
  const autoScroll = useConsoleStore((s) => s.autoScroll)
  const collapsed = useConsoleStore((s) => s.collapsed)
  const setFilters = useConsoleStore((s) => s.setFilters)
  const setCollapsed = useConsoleStore((s) => s.setCollapsed)
  const toggleAutoScroll = useConsoleStore((s) => s.toggleAutoScroll)
  const clear = useConsoleStore((s) => s.clear)
  const listRef = useRef<HTMLDivElement>(null)

  const hasContent = entries.length > 0 || Object.keys(streams).length > 0
  const errorCount = entries.filter((e) => e.level === 'error').length

  // Colapso (T7): fonte do estado no consoleStore (command palette toggla sem
  // montar o painel). Este efeito DERIVA o estado por TRANSIÇÃO de conteúdo:
  //   - mount (sem transição): aplica a regra original (saved ?? !hasContent);
  //   - vazio→cheio: SEMPRE expande (regressão T7 F1 — antes da T7, novo log
  //     expandia mesmo com preferência manual de colapsar; logs não podem
  //     ficar escondidos);
  //   - cheio→vazio: colapsa (auto-collapse histórico).
  // Preferência manual (toggle) permanece: setCollapsed + localStorage no
  // toggleCollapse; derivação automática não sobrescreve estado estável.
  const hadContent = useRef(hasContent)
  useEffect(() => {
    const prev = hadContent.current
    hadContent.current = hasContent
    if (prev !== hasContent) {
      // Transição real de conteúdo: expande/collapsa sem olhar preferência.
      setCollapsed(!hasContent)
      return
    }
    // Sem transição → só o mount cai aqui (deps estáveis): regra original.
    setCollapsed(getSavedCollapsed() ?? !hasContent)
  }, [hasContent, setCollapsed])

  const toggleCollapse = () => {
    const next = !collapsed
    setCollapsed(next)
    try {
      localStorage.setItem(STORAGE_KEY_CONSOLE_COLLAPSED, String(next))
    } catch {
      // Fallback defensivo
    }
  }

  const handleExportLogs = () => {
    const lines = visible.map((e) => `[${new Date(e.ts).toISOString()}] [${e.level.toUpperCase()}] [${e.node}] ${e.message}`)
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `loopforge-console-${new Date().toISOString().slice(0, 10)}.log`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

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

  // Retenção: entradas antigas cortadas do DOM (store intacta) + aviso.
  const truncated = entries.length > MAX_CONSOLE_ENTRIES
  const displayed = truncated ? visible.slice(-MAX_CONSOLE_ENTRIES) : visible

  // Streams de token a token (V1.1/ADR-0007): tratados como nível info —
  // somem sob filtro warn/error; nó/query seguem os filtros comuns.
  const streamList = Object.values(streams)
  const visibleStreams = useMemo(() => {
    const q = filters.query.trim().toLowerCase()
    return streamList.filter((s) => {
      if (filters.node !== 'all' && s.node !== filters.node) return false
      if (filters.level !== 'all' && filters.level !== 'info') return false
      if (q && !s.content.toLowerCase().includes(q)) return false
      return true
    })
  }, [streamList, filters])

  // Auto-expand/collapse: derivado no effect acima ([hasContent]) — regra
  // original (auditoria P0.5) preservada; colapso manual com conteúdo permanece.

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
      {/* Tab bar ícone-only (T6): Console sempre ativo + Terminal (abre o
          drawer — wire do App) + badge de erros. Chevron de colapso à direita
          (mesma semântica de antes: ▸ colapsado / ▾ expandido). */}
      <div className="flex h-[var(--tab-h)] items-center border-b border-[var(--border)]">
        <IconTabBar
          items={[
            { key: 'console', label: 'Console', icon: 'console', count: errorCount, active: true, onClick: () => {} },
            { key: 'terminal', label: 'Terminal', icon: 'terminal', onClick: () => onOpenTerminal?.() },
          ]}
        />
        <div className="ml-auto flex items-center gap-2 pr-1">
          {collapsed ? (
            <>
              <span className="text-xs text-[var(--text-dim)]">
                {hasContent ? `${entries.length + streamList.length} ${entries.length + streamList.length === 1 ? 'log' : 'logs'}` : 'No logs'}
              </span>
              {errorCount > 0 && (
                <span className="rounded bg-[var(--err)]/20 px-1.5 py-0.5 text-[10px] font-bold text-[var(--err-text)]">
                  {errorCount} {errorCount === 1 ? 'error' : 'errors'}
                </span>
              )}
            </>
          ) : null}
          <button
            type="button"
            aria-label={collapsed ? 'Expand console' : 'Collapse console'}
            aria-expanded={!collapsed}
            onClick={toggleCollapse}
            className={chevronCls}
          >
            {collapsed ? '▸' : '▾'}
          </button>
        </div>
      </div>
      {!collapsed && (
        <>
          <div className="flex flex-wrap items-center gap-2 px-3 py-1.5">
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
            <Button size="sm" variant="subtle" aria-label="Export logs" title="Download filtered logs as .log file" onClick={handleExportLogs}>
              Export
            </Button>
            <Button size="sm" variant="subtle" aria-label="Clear logs" onClick={clear}>
              Clear
            </Button>
          </div>
          <div
            ref={listRef}
            role="list"
            onScroll={handleScroll}
            className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 font-mono text-xs leading-5 [scrollbar-gutter:stable]"
          >
            {entries.length === 0 && streamList.length === 0 ? (
              <EmptyState
                compact
                icon={
                  <svg viewBox="0 0 24 24" className="h-6 w-6 stroke-current fill-none stroke-[1.5]">
                    <polyline points="4 17 10 11 4 5" />
                    <line x1="12" y1="19" x2="20" y2="19" />
                  </svg>
                }
                title="No console output yet"
                description="Pipeline execution logs and agent thought streams will appear here in real-time."
              />
            ) : visible.length === 0 && visibleStreams.length === 0 ? (
              <p className="mt-1 text-[var(--text-dim)]">No matching logs</p>
            ) : (
              <>
                {truncated && (
                  <div className="py-0.5 italic text-[var(--text-dim)]" role="note">
                    … older logs truncated (showing last {MAX_CONSOLE_ENTRIES})
                  </div>
                )}
                {displayed.map((e) => (
                  <div key={e.id} role="listitem" className="flex items-baseline gap-2 py-0.5">
                    <span className="select-none text-[var(--text-dim)]">{formatTs(e.ts)}</span>
                    <span className={`font-semibold ${LEVEL_COLORS[e.level]}`}>[{e.level.toUpperCase()}]</span>
                    <span className="text-[var(--text-dim)]">[{e.node ? ((NODE_LABELS as Record<string, string>)[e.node] ?? e.node) : 'system'}]</span>
                    <span className="rounded-sm whitespace-pre-wrap break-all text-[var(--text)] hover:bg-[var(--bg-elev-2)]">{renderHighlighted(e.message, filters.query)}</span>
                  </div>
                ))}
                {visibleStreams.map((s) => (
                  <div key={s.node} role="listitem" data-testid="console-stream" className="text-[var(--text)] whitespace-pre-wrap break-words py-0.5">
                    <span className="text-[var(--text-dim)]">[{formatTs(s.ts)}]</span>{' '}
                    <span className="text-[var(--text)] font-semibold">[{s.node}]</span>{' '}
                    <span className="text-[var(--info-text)] font-semibold">[STREAM]</span>{' '}
                    <span>{s.content}</span>
                    <span className="console-stream-cursor" />
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
