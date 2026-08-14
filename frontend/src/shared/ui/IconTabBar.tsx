import type { IconName } from './icons'
import { Icon } from './icons'

// Tab de painel ícone-only (T6): item único da IconTabBar.
export interface IconTab {
  key: string
  label: string
  icon: IconName
  /** Badge numérico (ex.: contagem de erros) — oculto quando 0/undefined. */
  count?: number
  active?: boolean
  onClick: () => void
}

export interface IconTabBarProps {
  items: IconTab[]
  ariaLabel?: string
}

// Barra de tabs ícone-only do panel bottom (T6): 32px (--tab-h), glifos
// geométricos simples (sem VS Code), tooltip nativa via title+aria-label
// (mesmo padrão do ActivityRail). Botões nativos com aria-pressed (padrão do
// repo: TopbarAction/QueueBadge/ActivityRail) — sem role=tab/tablist (ARIA
// inválido: aria-pressed não existe em role=tab; a11y via button nativo,
// Enter/Space nativos, sem exigência de roving tabindex). Ativo = accent +
// barra top 2px (after:) + bg-elev. Count em badge mono (erros) — err/20 +
// err-text, como o hint colapsado do console.
export function IconTabBar({ items, ariaLabel = 'Panel tabs' }: IconTabBarProps) {
  return (
    <div aria-label={ariaLabel} className="flex items-stretch">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          aria-pressed={item.active ?? false}
          aria-label={item.label}
          title={item.label}
          onClick={item.onClick}
          className={`relative flex h-[var(--tab-h)] items-center gap-1.5 px-2 text-[var(--text-dim)] transition-colors duration-(--dur-fast) hover:bg-[var(--bg-elev)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] ${
            item.active ? 'bg-[var(--bg-elev)] text-[var(--accent)] after:absolute after:inset-x-0 after:top-0 after:h-0.5 after:bg-[var(--accent)]' : ''
          }`}
        >
          <Icon name={item.icon} className="h-4 w-4 shrink-0" />
          {item.count !== undefined && item.count > 0 ? (
            <span className="rounded bg-[var(--err)]/20 px-1 py-px font-mono text-(--text-2xs) font-semibold text-[var(--err-text)]">
              {item.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )
}
