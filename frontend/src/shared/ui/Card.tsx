import type { HTMLAttributes, ReactNode } from 'react'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

// Superfície de card padrão (01b §2.1): bg-elev + border 1px + radius-md —
// padrão `rounded-md border border-[var(--border)] bg-[var(--bg-elev)] px-3
// py-2` repetido em ~15 lugares; primitivo centraliza.
export function Card({ className = '', children, ...rest }: CardProps) {
  return (
    <div className={`rounded-md border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-2 ${className}`} {...rest}>
      {children}
    </div>
  )
}
