import { useAuthStore } from '../../stores/authStore'
import { VIEW_ROLE, VIEWS_META, WORKSPACE_GROUPS } from '../lib/views'
import type { ViewKey } from '../lib/views'
import { Icon } from './icons'

export interface ActivityRailProps {
  /** View ativa (null = nenhuma). */
  active: ViewKey | null
  onSelect: (v: ViewKey) => void
}

// Rail de atividade (spec ade-shell-visual §2): coluna 48px icon-only à
// esquerda do main. Botão 48px (h-12) com ícone 20px; ativo = barra accent
// 2px à esquerda + bg-elev + text accent-text; hover bg-elev; tooltip nativo
// (title + aria-label — nunca canal único); grupos com separadores h-px
// (WORKSPACE_GROUPS). data-active p/ teste/styling. 17 botões × 48px podem
// exceder a altura — scrollbar fina global (tokens.css) aparece quando
// overflow (affordance; oculta aqui tornaria o fim da lista inalcançável).
export function ActivityRail({ active, onSelect }: ActivityRailProps) {
  const can = useAuthStore((s) => s.can)
  return (
    <nav
      aria-label="Activity"
      className="ade-glass flex w-[var(--rail-w)] shrink-0 flex-col overflow-y-auto border-r border-[var(--border)]/60 py-1"
    >
      {WORKSPACE_GROUPS.map(({ group, views }, gi) => {
        const allowed = views.filter((key) => can(VIEW_ROLE[key] ?? 'viewer'))
        if (allowed.length === 0) return null
        return (
          <div key={group}>
            {gi > 0 && <div className="mx-2 my-1.5 h-px bg-[var(--border)]/40" aria-hidden="true" />}
            {allowed.map((key) => {
            const meta = VIEWS_META[key]
            const isActive = active === key
            return (
              <button
                key={key}
                type="button"
                aria-pressed={isActive}
                aria-label={meta.label}
                title={meta.label}
                data-active={isActive}
                onClick={() => onSelect(key)}
                className={[
                  'relative flex h-12 w-full items-center justify-center transition-all duration-[var(--dur-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]',
                  isActive
                    ? 'bg-[var(--bg-elev-2)] text-[var(--accent-text)] shadow-inner'
                    : 'text-[var(--text-dim)] hover:bg-[var(--bg-elev)] hover:text-[var(--text)]',
                ].join(' ')}
              >
                {/* Barra ativa 2px à esquerda com glow suave. */}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]"
                  />
                )}
                <Icon name={meta.icon} className="h-5 w-5 shrink-0" />
              </button>
            )
            })}
          </div>
        )
      })}
    </nav>
  )
}
