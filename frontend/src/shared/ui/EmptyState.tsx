import type { ReactNode } from 'react'

export interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
}

// Estado vazio centralizado: título, descrição opcional e ação opcional.
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <h2 className="text-base font-semibold text-[var(--text)]">{title}</h2>
      {description ? <p className="text-sm text-[var(--text-dim)]">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
