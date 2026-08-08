import type { InputHTMLAttributes } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Marca o campo com borda/ring de erro (mensagem externa com role="alert"). */
  invalid?: boolean
}

// Form control (01b §3.12): 32px, bg-elev, border 1px, radius-sm (4px),
// hover clareia a borda, focus ring-2 accent, disabled opacity-50.
export function Input({ invalid = false, className = '', ...rest }: InputProps) {
  return (
    <input
      className={[
        'h-8 rounded-sm border bg-[var(--bg-elev)] px-2 text-sm text-[var(--text)] placeholder:text-[var(--text-dim)]',
        'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        invalid
          ? 'border-[var(--err)] ring-1 ring-[var(--err)]/30'
          : 'border-[var(--border)] hover:border-[var(--border-hover)]',
        className,
      ].join(' ')}
      {...rest}
    />
  )
}
