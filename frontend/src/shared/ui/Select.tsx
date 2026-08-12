import type { SelectHTMLAttributes } from 'react'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {}

// Form control (01b §3.12): mesma base do Input — 32px, bg-elev, border 1px,
// radius-sm (4px), hover clareia a borda, focus ring-2 accent, disabled 50%.
// Substitui o selectCls duplicado em 5 painéis.
export function Select({ className = '', ...rest }: SelectProps) {
  return (
    <select
      className={`h-8 rounded-sm border border-[var(--border)] bg-[var(--bg-elev)] px-2 text-sm text-[var(--text)] transition-colors duration-150 hover:border-[var(--border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...rest}
    />
  )
}
