import type { ReactNode } from 'react'

export interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
  /** Variante compacta (auditoria P0): py-6 + título sm — p/ áreas de altura fixa (console h-60). */
  compact?: boolean
}

// Estado vazio centralizado: título, descrição opcional e ação opcional.
export function EmptyState({ title, description, action, compact = false }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 px-6 text-center ${compact ? 'py-6' : 'py-12'}`}>
      <h2 className={`font-semibold text-[var(--text)] ${compact ? 'text-sm' : 'text-base'}`}>{title}</h2>
      {description ? <p className="text-sm text-[var(--text-dim)]">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
