import { useEffect, useMemo, useRef, useState } from 'react'
import { COMMANDS, filterCommands } from '../lib/commands'
import type { Command, PaletteCtx } from '../lib/commands'
import { useAuthStore } from '../../stores/authStore'

// ─── Command palette ⌘K (T7, MVP) ─────────────────────────────────────────
// Overlay modal central (560px): input de filtro com auto-focus, lista de
// comandos com kbd à direita, navegação ↑↓/Enter/Esc. Fecha sempre após
// executar uma ação (palette clássica); "Close palette" é tratado pela UI
// (run no-op — o fechamento acontece aqui, não no ctx).

const kbdCls =
  'rounded border border-[var(--border)] bg-[var(--bg-elev-2)] px-1.5 py-0.5 font-mono text-(--text-2xs) text-[var(--text-dim)]'

export function CommandPalette({ open, onClose, ctx }: { open: boolean; onClose: () => void; ctx: PaletteCtx }) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  const can = useAuthStore((s) => s.can)
  const results = useMemo(() => filterCommands(query).filter((c) => !c.role || can(c.role)), [query, can])

  // Ao abrir: guarda o elemento que tinha foco (trigger ⌘K), reseta query/
  // seleção e foca o input (após o overlay montar). Ao fechar/desmontar:
  // devolve o foco ao trigger (T8 — focus restore).
  useEffect(() => {
    if (!open) {
      return
    }
    triggerRef.current = document.activeElement as HTMLElement | null
    setQuery('')
    setIndex(0)
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => {
      clearTimeout(t)
      triggerRef.current?.focus?.()
    }
  }, [open])

  // Esc global (foco pode sair do input ao clicar um item).
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  // Seleção volta ao topo quando o filtro muda.
  useEffect(() => {
    setIndex(0)
  }, [query])

  if (!open) return null

  const active = results[Math.min(index, Math.max(0, results.length - 1))]

  const runItem = (cmd: Command) => {
    if (cmd.id !== 'palette-close') cmd.run(ctx)
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndex((i) => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndex((i) => (i - 1 + results.length) % results.length)
    } else if (e.key === 'Enter' && active) {
      e.preventDefault()
      runItem(active)
    } else if (e.key === 'Tab') {
      // Focus trap simples (T8): ciclo Tab/Shift+Tab entre os focáveis do
      // diálogo (input + itens) — não deixa o foco escapar p/ trás do modal.
      const focusables = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>('button, input[type="text"]') ?? [],
      )
      if (focusables.length < 2) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] bg-[var(--overlay)]"
      role="presentation"
      onMouseDown={(e) => {
        // Clique no backdrop fecha (T8); cliques dentro do painel não
        // borbulham p/ cá (target !== currentTarget).
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="ade-modal-card-in ade-glass mx-auto mt-[15vh] flex w-[560px] max-w-[90vw] flex-col overflow-hidden rounded-xl border border-white/10 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.7)]"
        onKeyDown={onKeyDown}
      >
        {/* Input de filtro com glifo de busca (inline, sem ícone dedicado). */}
        <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-3 bg-zinc-950/40">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0 stroke-[var(--text-dim)] fill-none stroke-[2]">
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            role="searchbox"
            aria-label="Search commands"
            placeholder="Type a command or search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-dim)]"
          />
          <kbd className="ade-kbd">esc</kbd>
        </div>

        {/* Lista de comandos filtrados. */}
        <div role="listbox" aria-label="Commands" className="max-h-[40vh] overflow-y-auto p-1.5 [scrollbar-gutter:stable]">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-[var(--text-dim)]">No commands match “{query}”</p>
          ) : (
            results.map((cmd) => {
              const isActive = cmd.id === active?.id
              return (
                <button
                  key={cmd.id}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onMouseEnter={() => setIndex(results.indexOf(cmd))}
                  onClick={() => runItem(cmd)}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm rounded-md transition-colors duration-(--dur-fast) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] ${
                    isActive ? 'bg-[var(--accent)] text-white shadow-xs' : 'text-[var(--text-dim)] hover:bg-[var(--bg-elev-2)] hover:text-[var(--text)]'
                  }`}
                >
                  <span className="truncate font-medium">{cmd.title}</span>
                  {cmd.kbd ? <kbd className={isActive ? 'font-mono text-(--text-2xs) text-white/80 bg-white/20 px-1.5 py-0.5 rounded' : 'ade-kbd'}>{cmd.kbd}</kbd> : null}
                </button>
              )
            })
          )}
        </div>

        {/* Footer com hints. */}
        <div className="flex items-center justify-between border-t border-white/10 px-4 py-2 text-(--text-2xs) text-[var(--text-dim)] bg-zinc-950/40">
          <span className="font-mono">{COMMANDS.length} commands</span>
          <span className="flex items-center gap-3">
            <span>↑↓ navigate</span>
            <span>↵ select</span>
            <span>esc close</span>
          </span>
        </div>
      </div>
    </div>
  )
}
