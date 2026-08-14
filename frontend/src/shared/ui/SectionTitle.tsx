import type { ReactNode } from 'react'

export interface SectionTitleProps {
  children: ReactNode
  /** Contagem opcional exibida após o título, ex.: (3). */
  count?: number | string
  className?: string
}

// Título de seção de painel (01b §2.4): label uppercase tracking-wide em
// --text-dim — padrão repetido em ~30 lugares; primitivo centraliza o estilo.
export function SectionTitle({ children, count, className = '' }: SectionTitleProps) {
  return (
    <h3 className={`text-xs font-semibold uppercase tracking-wide text-[var(--text-dim)] ${className}`}>
      {children}
      {count !== undefined && <span className="text-[var(--text-dim)]"> ({count})</span>}
    </h3>
  )
}
